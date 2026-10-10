-- ─────────────────────────────────────────────────────────────
-- 프로그램별 횟수권 차감 횟수
-- 횟수권(count · period_count)은 금액이 정해진 공용 횟수권이고, 프로그램마다 1회 예약에 몇 회를 차감할지 정한다.
--   예) 플라잉요가 3회, 1:1 PT 5회. 기간권(period)은 지금처럼 차감하지 않는다
-- 차감한 횟수는 예약(bookings.deducted_count)에 남겨 두고, 무료 취소·폐강 때 같은 만큼 복구한다.
-- 남은 횟수가 차감 횟수보다 적으면 PASS_INSUFFICIENT.
-- ─────────────────────────────────────────────────────────────

alter table public.programs
  add column pass_cost int not null default 1 check (pass_cost between 1 and 100);
comment on column public.programs.pass_cost is '횟수권으로 예약할 때 1회 예약에 차감하는 횟수';

alter table public.bookings add column deducted_count int not null default 0 check (deducted_count >= 0);
comment on column public.bookings.deducted_count is '이 예약으로 차감한 횟수 (복구할 때 같은 만큼 되돌린다)';
update public.bookings set deducted_count = 1 where pass_deducted;
alter table public.bookings
  add constraint bookings_deducted_count_matches check (pass_deducted = (deducted_count > 0));

-- 프로그램의 차감 횟수 (없으면 1)
create or replace function private.program_pass_cost(p_program_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.pass_cost from public.programs p where p.id = p_program_id), 1);
$$;
revoke all on function private.program_pass_cost(uuid) from public;

-- 이용권에서 p_count 회 차감(횟수권만). 차감한 횟수를 돌려준다(기간권은 0). 잔여 1회가 되면 안내 알림
create or replace function private.deduct_pass(p_pass_id uuid, p_count int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.member_passes;
begin
  select * into v_pass from public.member_passes where id = p_pass_id for update;
  if v_pass.remaining_count is null then
    return 0;
  end if;
  if v_pass.remaining_count <= 0 then
    perform private.raise_app_error('PASS_EXHAUSTED');
  end if;
  if v_pass.remaining_count < p_count then
    perform private.raise_app_error('PASS_INSUFFICIENT');
  end if;
  update public.member_passes set remaining_count = remaining_count - p_count where id = p_pass_id;
  if v_pass.remaining_count - p_count = 1 then
    perform private.enqueue_notification(
      v_pass.center_id, v_pass.member_id, 'pass_remaining_one',
      jsonb_build_object('member_pass_id', v_pass.id, 'pass_name', v_pass.name, 'remaining_count', 1,
        'end_date', v_pass.end_date),
      'pass_remaining_one:' || v_pass.id
    );
  end if;
  return p_count;
end;
$$;

-- 차감했던 p_count 회를 되돌린다 (총 횟수를 넘지 않게)
create or replace function private.restore_pass(p_pass_id uuid, p_count int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.member_passes where id = p_pass_id for update;
  update public.member_passes
  set remaining_count = least(remaining_count + greatest(coalesce(p_count, 0), 0), total_count)
  where id = p_pass_id and remaining_count is not null;
end;
$$;

revoke all on function private.deduct_pass(uuid, int) from public;
revoke all on function private.restore_pass(uuid, int) from public;


create or replace function private.pass_error(
  p_pass public.member_passes,
  p_session public.sessions,
  p_local_date date,
  p_timezone text,
  p_exclude_booking_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_used int;
begin
  if p_pass.status <> 'active' or p_pass.deleted_at is not null then
    return 'NO_VALID_PASS';
  end if;
  if not exists (
    select 1 from public.program_allowed_products pap
    where pap.program_id = p_session.program_id and pap.product_id = p_pass.product_id
  ) then
    return 'PASS_NOT_ALLOWED';
  end if;
  if p_pass.start_date > p_local_date then
    return 'PASS_NOT_STARTED';
  end if;
  if p_pass.end_date is not null and p_pass.end_date < p_local_date then
    return 'PASS_EXPIRED';
  end if;
  if exists (
    select 1 from public.pass_holds h
    where h.member_pass_id = p_pass.id and p_local_date between h.start_date and h.end_date
  ) then
    return 'PASS_ON_HOLD';
  end if;
  if p_pass.remaining_count is not null and p_pass.remaining_count <= 0 then
    return 'PASS_EXHAUSTED';
  end if;
  -- 프로그램마다 정한 차감 횟수보다 남은 횟수가 적으면 예약할 수 없다
  if p_pass.remaining_count is not null
     and p_pass.remaining_count < private.program_pass_cost(p_session.program_id) then
    return 'PASS_INSUFFICIENT';
  end if;
  if p_pass.period_limit_count is not null then
    -- 대기·늦은 취소·노쇼도 1회 사용으로 센다 (무료 취소만 제외)
    select count(*) into v_used
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.member_pass_id = p_pass.id
      and b.status in ('booked', 'waitlisted', 'attended', 'no_show', 'late_cancelled')
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and date_trunc(p_pass.period_limit_unit::text, (s.starts_at at time zone p_timezone)::date::timestamp)
        = date_trunc(p_pass.period_limit_unit::text, p_local_date::timestamp);
    if v_used >= p_pass.period_limit_count then
      return 'PERIOD_LIMIT_REACHED';
    end if;
  end if;
  return null;
end;
$$;

create or replace function private.pass_error_rank(p_code text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'PERIOD_LIMIT_REACHED' then 1
    when 'PASS_ON_HOLD' then 2
    when 'PASS_INSUFFICIENT' then 3
    when 'PASS_EXHAUSTED' then 3
    when 'PASS_EXPIRED' then 4
    when 'PASS_NOT_STARTED' then 5
    else 9
  end;
$$;

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
  v_deducted_count int := 0;
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
    v_deducted_count := private.deduct_pass(v_pass.id, private.program_pass_cost(v_session.program_id));
    v_deducted := v_deducted_count > 0;
    update public.sessions set booked_count = booked_count + 1 where id = p_session_id;
  else
    select coalesce(max(b.waitlist_position), 0) + 1 into v_position
    from public.bookings b
    where b.session_id = p_session_id and b.status = 'waitlisted';
    update public.sessions set waitlist_count = waitlist_count + 1 where id = p_session_id;
  end if;

  insert into public.bookings (
    center_id, session_id, member_id, member_pass_id, status, waitlist_position,
    pass_deducted, deducted_count, booked_by, booked_by_staff_id
  ) values (
    v_session.center_id, p_session_id, p_member_id, v_pass.id, v_status, v_position,
    v_deducted, v_deducted_count, p_booked_by, p_staff_id
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
    'deducted_count', v_deducted_count,
    'remaining_count', (select mp.remaining_count from public.member_passes mp where mp.id = v_pass.id)
  );
end;
$$;

create or replace function private.promote_waitlist(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_rules private.center_rules;
  v_local_date date;
  v_next public.bookings;
  v_pass public.member_passes;
  v_pass_id uuid;
  v_deducted_count int;
  v_promoted jsonb := '[]'::jsonb;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' or v_session.deleted_at is not null then
    return v_promoted;
  end if;

  v_rules := private.center_rules(v_session.center_id);
  if now() >= v_session.starts_at - make_interval(mins => v_rules.close_minutes_before) then
    return v_promoted;
  end if;
  v_local_date := (v_session.starts_at at time zone v_rules.timezone)::date;

  loop
    exit when v_session.booked_count >= v_session.capacity;

    select * into v_next
    from public.bookings
    where session_id = p_session_id and status = 'waitlisted'
    order by waitlist_position
    limit 1
    for update;
    exit when not found;

    v_pass_id := null;
    if v_next.member_pass_id is not null then
      select * into v_pass from public.member_passes where id = v_next.member_pass_id for update;
      if private.pass_error(v_pass, v_session, v_local_date, v_rules.timezone, v_next.id) is null then
        v_pass_id := v_pass.id;
      end if;
    end if;
    if v_pass_id is null then
      select pp.pass_id into v_pass_id
      from private.pick_pass(v_next.member_id, v_session, v_local_date, v_rules.timezone, v_next.id) pp;
      if v_pass_id is not null then
        select * into v_pass from public.member_passes where id = v_pass_id for update;
        if private.pass_error(v_pass, v_session, v_local_date, v_rules.timezone, v_next.id) is not null then
          v_pass_id := null;
        end if;
      end if;
    end if;

    -- 대기열에서 빼고 뒤 순번을 한 칸씩 당긴다
    update public.bookings
    set waitlist_position = waitlist_position - 1
    where session_id = p_session_id and status = 'waitlisted' and waitlist_position > v_next.waitlist_position;
    v_session.waitlist_count := v_session.waitlist_count - 1;

    if v_pass_id is null then
      update public.bookings
      set status = 'cancelled', waitlist_position = null, cancelled_at = now(), cancel_reason = 'promotion_failed'
      where id = v_next.id;
      continue;
    end if;

    v_deducted_count := private.deduct_pass(v_pass_id, private.program_pass_cost(v_session.program_id));
    update public.bookings
    set status = 'booked', waitlist_position = null, member_pass_id = v_pass_id,
        pass_deducted = v_deducted_count > 0, deducted_count = v_deducted_count, promoted_at = now()
    where id = v_next.id;
    v_session.booked_count := v_session.booked_count + 1;

    perform private.enqueue_notification(
      v_session.center_id, v_next.member_id, 'waitlist_promoted',
      private.session_payload(p_session_id) || jsonb_build_object('booking_id', v_next.id),
      'waitlist_promoted:' || v_next.id
    );
    v_promoted := v_promoted || jsonb_build_array(v_next.id);
  end loop;

  update public.sessions
  set booked_count = v_session.booked_count, waitlist_count = v_session.waitlist_count
  where id = p_session_id;
  return v_promoted;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_waive_penalty boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_rules private.center_rules;
  v_is_staff boolean;
  v_is_member boolean;
  v_reason text;
  v_new_status public.booking_status;
  v_restored boolean := false;
  v_promoted jsonb := '[]'::jsonb;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    perform private.raise_app_error('BOOKING_NOT_FOUND');
  end if;

  v_is_staff := private.is_staff(v_booking.center_id);
  v_is_member := v_booking.member_id in (select private.member_ids());
  if not v_is_staff and not v_is_member then
    perform private.raise_app_error('BOOKING_NOT_FOUND');
  end if;
  if p_waive_penalty and not v_is_staff then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  v_reason := case when v_is_member then 'member' else 'staff' end;

  select * into v_session from public.sessions where id = v_booking.session_id for update;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.status not in ('booked', 'waitlisted') then
    perform private.raise_app_error('BOOKING_NOT_CANCELLABLE');
  end if;
  if not v_is_staff and now() >= v_session.starts_at then
    perform private.raise_app_error('SESSION_STARTED');
  end if;

  v_rules := private.center_rules(v_booking.center_id);

  if v_booking.status = 'waitlisted' then
    update public.bookings
    set status = 'cancelled', waitlist_position = null, cancelled_at = now(), cancel_reason = v_reason
    where id = p_booking_id;
    update public.bookings
    set waitlist_position = waitlist_position - 1
    where session_id = v_session.id and status = 'waitlisted' and waitlist_position > v_booking.waitlist_position;
    update public.sessions set waitlist_count = waitlist_count - 1 where id = v_session.id;
    return jsonb_build_object('booking_id', p_booking_id, 'status', 'cancelled', 'restored', false,
      'promoted', v_promoted);
  end if;

  if p_waive_penalty
     or now() <= v_session.starts_at
       - make_interval(secs => (v_rules.free_cancel_hours_before * 3600)::double precision) then
    v_new_status := 'cancelled';
    if v_booking.pass_deducted then
      perform private.restore_pass(v_booking.member_pass_id, v_booking.deducted_count);
      v_restored := true;
    end if;
  else
    v_new_status := 'late_cancelled';
  end if;

  update public.bookings
  set status = v_new_status, cancelled_at = now(), cancel_reason = v_reason,
      pass_deducted = case when v_restored then false else pass_deducted end,
      deducted_count = case when v_restored then 0 else deducted_count end
  where id = p_booking_id;
  update public.sessions set booked_count = booked_count - 1 where id = v_session.id;

  if v_rules.auto_promote_waitlist then
    v_promoted := private.promote_waitlist(v_session.id);
  end if;

  return jsonb_build_object('booking_id', p_booking_id, 'status', v_new_status, 'restored', v_restored,
    'promoted', v_promoted);
end;
$$;

create or replace function public.cancel_session(p_session_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_booking record;
  v_payload jsonb;
  v_affected jsonb := '[]'::jsonb;
  v_restored int := 0;
begin
  select * into v_session from public.sessions where id = p_session_id and deleted_at is null for update;
  if not found then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;
  if not private.is_staff(v_session.center_id) then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  if v_session.status = 'cancelled' then
    perform private.raise_app_error('SESSION_CANCELLED');
  end if;
  if now() >= v_session.ends_at then
    perform private.raise_app_error('SESSION_ENDED');
  end if;

  v_payload := private.session_payload(p_session_id) || jsonb_build_object('reason', p_reason);

  for v_booking in
    select b.id, b.member_id, b.member_pass_id, b.status, b.pass_deducted, b.deducted_count,
      m.name as member_name
    from public.bookings b
    join public.members m on m.id = b.member_id
    where b.session_id = p_session_id and b.status in ('booked', 'waitlisted')
    order by b.member_pass_id, b.id
    for update of b
  loop
    if v_booking.pass_deducted then
      perform private.restore_pass(v_booking.member_pass_id, v_booking.deducted_count);
      v_restored := v_restored + 1;
    end if;
    update public.bookings
    set status = 'cancelled', waitlist_position = null, pass_deducted = false, deducted_count = 0,
        cancelled_at = now(), cancel_reason = 'session_cancelled'
    where id = v_booking.id;

    perform private.enqueue_notification(
      v_session.center_id, v_booking.member_id, 'session_cancelled',
      v_payload || jsonb_build_object('booking_id', v_booking.id),
      'session_cancelled:' || v_booking.id,
      true
    );
    v_affected := v_affected || jsonb_build_object(
      'booking_id', v_booking.id,
      'member_id', v_booking.member_id,
      'member_name', v_booking.member_name,
      'previous_status', v_booking.status
    );
  end loop;

  update public.sessions
  set status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = p_reason,
      waitlist_count = 0,
      booked_count = (
        select count(*) from public.bookings b
        where b.session_id = p_session_id and b.status in ('booked', 'attended', 'no_show')
      )
  where id = p_session_id;

  return jsonb_build_object('session_id', p_session_id, 'affected', v_affected, 'restored_count', v_restored);
end;
$$;

create or replace function public.preview_booking(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_rules private.center_rules;
  v_member_id uuid;
  v_pass_id uuid;
  v_error text;
  v_pass public.member_passes;
begin
  select * into v_session from public.sessions where id = p_session_id and deleted_at is null;
  if not found or not private.is_published(v_session.publish_at, v_session.program_id) then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;
  v_member_id := private.my_member_id(v_session.center_id);
  v_rules := private.center_rules(v_session.center_id);
  select pp.pass_id, pp.error_code into v_pass_id, v_error
  from private.pick_pass(v_member_id, v_session, (v_session.starts_at at time zone v_rules.timezone)::date,
    v_rules.timezone) pp;
  if v_pass_id is not null then
    select * into v_pass from public.member_passes where id = v_pass_id;
  end if;
  return jsonb_build_object(
    'pass', case when v_pass_id is null then null else jsonb_build_object(
      'id', v_pass.id, 'name', v_pass.name, 'type', v_pass.type,
      'remaining_count', v_pass.remaining_count, 'end_date', v_pass.end_date) end,
    'error', v_error,
    -- 이 수업 1회 예약에 차감되는 횟수 (횟수권일 때)
    'cost', private.program_pass_cost(v_session.program_id),
    'free_cancel_until', v_session.starts_at
      - make_interval(secs => (v_rules.free_cancel_hours_before * 3600)::double precision),
    'close_at', v_session.starts_at - make_interval(mins => v_rules.close_minutes_before)
  );
end;
$$;

-- 1회 차감 버전은 더 이상 쓰지 않는다
drop function private.deduct_pass(uuid);
drop function private.restore_pass(uuid);

-- 프로그램 저장: 차감 횟수(p_pass_cost) 추가
drop function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text, timestamptz);

create function public.save_program(
  p_center_id uuid,
  p_name text,
  p_type public.program_type,
  p_default_capacity int,
  p_duration_min int,
  p_color text,
  p_allowed_product_ids uuid[],
  p_id uuid default null,
  p_default_instructor_id uuid default null,
  p_description text default null,
  p_publish_at timestamptz default null,
  p_pass_cost int default 1
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into public.programs (
      center_id, name, type, default_capacity, duration_min, color, default_instructor_id, description,
      publish_at, pass_cost, sort_order
    )
    values (
      p_center_id, p_name, p_type, p_default_capacity, p_duration_min, p_color, p_default_instructor_id,
      nullif(trim(p_description), ''), p_publish_at, coalesce(p_pass_cost, 1),
      coalesce((select max(p.sort_order) + 1 from public.programs p where p.center_id = p_center_id), 0)
    )
    returning id into v_id;
  else
    update public.programs
    set name = p_name,
        type = p_type,
        default_capacity = p_default_capacity,
        duration_min = p_duration_min,
        color = p_color,
        default_instructor_id = p_default_instructor_id,
        description = nullif(trim(p_description), ''),
        publish_at = p_publish_at,
        pass_cost = coalesce(p_pass_cost, 1)
    where id = p_id and center_id = p_center_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      perform private.raise_app_error('FORBIDDEN');
    end if;
  end if;

  delete from public.program_allowed_products
  where program_id = v_id and not (product_id = any (coalesce(p_allowed_product_ids, '{}')));

  insert into public.program_allowed_products (center_id, program_id, product_id)
  select p_center_id, v_id, product_id
  from unnest(coalesce(p_allowed_product_ids, '{}')) as product_id
  on conflict (program_id, product_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text,
  timestamptz, int)
  from public, anon;
grant execute on function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text,
  timestamptz, int)
  to authenticated;


-- 회원 시간표: 수업 카드에 횟수권 차감 횟수를 보여 주도록 pass_cost 를 함께 돌려준다 (반환 모양이 바뀌어 다시 만든다)
drop function public.member_schedule(uuid, date, date);

create function public.member_schedule(p_center_id uuid, p_from date, p_to date)
returns table (
  session_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  program_id uuid,
  program_name text,
  program_color text,
  instructor_name text,
  capacity int,
  booked_count int,
  waitlist_count int,
  my_booking_id uuid,
  my_status public.booking_status,
  my_waitlist_position int,
  my_pass_type public.pass_type,
  pass_cost int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.my_member_id(p_center_id);
  v_timezone text := (private.center_rules(p_center_id)).timezone;
begin
  if p_to - p_from > 31 then
    perform private.raise_app_error('VALIDATION');
  end if;
  return query
  select s.id, s.starts_at, s.ends_at, p.id, p.name, p.color, st.name,
         s.capacity, s.booked_count, s.waitlist_count, b.id, b.status, b.waitlist_position, mp.type,
         p.pass_cost
  from public.sessions s
  join public.programs p on p.id = s.program_id
  left join public.staff st on st.id = s.instructor_id
  left join public.bookings b
    on b.session_id = s.id and b.member_id = v_member_id
   and b.status in ('booked', 'waitlisted', 'attended', 'no_show')
  left join public.member_passes mp on mp.id = b.member_pass_id
  where s.center_id = p_center_id
    and s.deleted_at is null
    and s.status = 'scheduled'
    and coalesce(s.publish_at, '-infinity'::timestamptz) <= now()
    and coalesce(p.publish_at, '-infinity'::timestamptz) <= now()
    and (s.starts_at at time zone v_timezone)::date between p_from and p_to
  order by s.starts_at, p.name;
end;
$$;

revoke all on function public.member_schedule(uuid, date, date) from public, anon;
grant execute on function public.member_schedule(uuid, date, date) to authenticated;
