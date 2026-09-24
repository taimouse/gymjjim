-- ─────────────────────────────────────────────────────────────
-- 예약: book_session(회원) · staff_book_for_member(관리자 대리 예약)
-- 정원 계산은 세션 행을 FOR UPDATE 로 잠근 상태에서만 한다.
-- ─────────────────────────────────────────────────────────────

create or replace function private.create_booking(
  p_session_id uuid,
  p_member_id uuid,
  p_member_pass_id uuid,
  p_booked_by public.booked_by,
  p_staff_id uuid,
  p_check_window boolean,
  p_allow_over_capacity boolean,
  p_waitlist_if_full boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_rules private.center_rules;
  v_local_date date;
  v_pass_id uuid;
  v_pass public.member_passes;
  v_error text;
  v_status public.booking_status;
  v_position int;
  v_deducted boolean := false;
  v_booking_id uuid;
begin
  -- 같은 회원의 동시 예약을 한 줄로 세운다 (시간 겹침 검사가 경쟁 상태에 빠지지 않도록)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gymjjim:member:' || p_member_id::text, 0));

  select * into v_session
  from public.sessions
  where id = p_session_id and deleted_at is null
  for update;
  if not found then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;
  if v_session.status = 'cancelled' then
    perform private.raise_app_error('SESSION_CANCELLED');
  end if;

  v_rules := private.center_rules(v_session.center_id);
  v_local_date := (v_session.starts_at at time zone v_rules.timezone)::date;

  if p_check_window then
    if now() >= v_session.starts_at - make_interval(mins => v_rules.close_minutes_before) then
      perform private.raise_app_error('BOOKING_CLOSED');
    end if;
    -- 예약 오픈: 오늘(센터 시간대)부터 open_days_before 일 뒤 날짜의 수업까지
    if v_local_date > (now() at time zone v_rules.timezone)::date + v_rules.open_days_before then
      perform private.raise_app_error('BOOKING_NOT_OPEN');
    end if;
  end if;

  if exists (
    select 1 from public.bookings b
    where b.session_id = p_session_id and b.member_id = p_member_id
      and b.status in ('booked', 'waitlisted', 'attended', 'no_show')
  ) then
    perform private.raise_app_error('ALREADY_BOOKED');
  end if;

  if exists (
    select 1
    from public.bookings b
    join public.sessions o on o.id = b.session_id
    where b.member_id = p_member_id
      and b.status in ('booked', 'waitlisted', 'attended', 'no_show')
      and o.id <> p_session_id
      and o.status = 'scheduled'
      and o.deleted_at is null
      and o.starts_at < v_session.ends_at
      and o.ends_at > v_session.starts_at
  ) then
    perform private.raise_app_error('DUPLICATE_TIME');
  end if;

  -- 이용권: 지정했으면 그것, 아니면 만료 임박 순 자동 선택. 잠근 뒤 다시 검사한다.
  if p_member_pass_id is not null then
    v_pass_id := p_member_pass_id;
  else
    select pp.pass_id, pp.error_code into v_pass_id, v_error
    from private.pick_pass(p_member_id, v_session, v_local_date, v_rules.timezone) pp;
    if v_pass_id is null then
      perform private.raise_app_error(v_error);
    end if;
  end if;

  select * into v_pass
  from public.member_passes
  where id = v_pass_id and member_id = p_member_id and center_id = v_session.center_id
  for update;
  if not found then
    perform private.raise_app_error('PASS_NOT_FOUND');
  end if;
  v_error := private.pass_error(v_pass, v_session, v_local_date, v_rules.timezone);
  if v_error is not null then
    perform private.raise_app_error(v_error);
  end if;

  -- 정원
  if v_session.booked_count < v_session.capacity or p_allow_over_capacity then
    v_status := 'booked';
  elsif p_waitlist_if_full then
    v_status := 'waitlisted';
  else
    perform private.raise_app_error('SESSION_FULL');
  end if;

  if v_status = 'booked' then
    v_deducted := private.deduct_pass(v_pass.id);
    update public.sessions set booked_count = booked_count + 1 where id = p_session_id;
  else
    select coalesce(max(b.waitlist_position), 0) + 1 into v_position
    from public.bookings b
    where b.session_id = p_session_id and b.status = 'waitlisted';
    update public.sessions set waitlist_count = waitlist_count + 1 where id = p_session_id;
  end if;

  insert into public.bookings (
    center_id, session_id, member_id, member_pass_id, status, waitlist_position,
    pass_deducted, booked_by, booked_by_staff_id
  ) values (
    v_session.center_id, p_session_id, p_member_id, v_pass.id, v_status, v_position,
    v_deducted, p_booked_by, p_staff_id
  )
  returning id into v_booking_id;

  if v_status = 'booked' then
    perform private.enqueue_notification(
      v_session.center_id, p_member_id, 'booking_confirmed',
      private.session_payload(p_session_id) || jsonb_build_object('booking_id', v_booking_id),
      'booking_confirmed:' || v_booking_id
    );
  end if;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'status', v_status,
    'waitlist_position', v_position,
    'member_pass_id', v_pass.id,
    'remaining_count', (select mp.remaining_count from public.member_passes mp where mp.id = v_pass.id)
  );
end;
$$;

revoke all on function private.create_booking(uuid, uuid, uuid, public.booked_by, uuid, boolean, boolean, boolean)
  from public;

-- 회원 본인 예약. 정원이 차면 대기(waitlisted)로 들어간다.
create or replace function public.book_session(p_session_id uuid, p_member_pass_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
  v_member_id uuid;
begin
  if (select auth.uid()) is null then
    perform private.raise_app_error('NOT_AUTHENTICATED');
  end if;

  select s.center_id into v_center_id from public.sessions s where s.id = p_session_id and s.deleted_at is null;
  if v_center_id is null then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;

  select m.id into v_member_id
  from public.members m
  where m.user_id = (select auth.uid()) and m.center_id = v_center_id
    and m.status = 'active' and m.deleted_at is null;
  if v_member_id is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;

  return private.create_booking(p_session_id, v_member_id, p_member_pass_id, 'member', null, true, false, true);
end;
$$;

-- 관리자 대리 예약. override_rules 면 오픈/마감 규칙을 무시하고,
-- 정원이 찼을 때는 allow_over_capacity(정원 초과) 또는 waitlist(대기 등록)를 명시해야 한다.
create or replace function public.staff_book_for_member(
  p_session_id uuid,
  p_member_id uuid,
  p_override_rules boolean default false,
  p_allow_over_capacity boolean default false,
  p_member_pass_id uuid default null,
  p_waitlist boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
  v_staff_id uuid;
begin
  select s.center_id into v_center_id from public.sessions s where s.id = p_session_id and s.deleted_at is null;
  if v_center_id is null then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;

  v_staff_id := private.current_staff_id(v_center_id);
  if v_staff_id is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;

  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.center_id = v_center_id and m.status = 'active' and m.deleted_at is null
  ) then
    perform private.raise_app_error('MEMBER_NOT_FOUND');
  end if;

  return private.create_booking(
    p_session_id, p_member_id, p_member_pass_id, 'staff', v_staff_id,
    not p_override_rules, p_allow_over_capacity, p_waitlist
  );
end;
$$;

revoke all on function public.book_session(uuid, uuid) from public, anon;
grant execute on function public.book_session(uuid, uuid) to authenticated;
revoke all on function public.staff_book_for_member(uuid, uuid, boolean, boolean, uuid, boolean) from public, anon;
grant execute on function public.staff_book_for_member(uuid, uuid, boolean, boolean, uuid, boolean) to authenticated;
