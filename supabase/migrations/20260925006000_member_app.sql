-- ─────────────────────────────────────────────────────────────
-- 회원 앱 조회 RPC. 회원은 members·staff 테이블을 직접 읽지 않으므로 필요한 값만 돌려준다.
-- ─────────────────────────────────────────────────────────────

-- 로그인한 회원의 (센터별) 회원 id. 소속이 아니면 FORBIDDEN
create or replace function private.my_member_id(p_center_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select m.id into v_id from public.members m
  where m.center_id = p_center_id and m.user_id = (select auth.uid())
    and m.status = 'active' and m.deleted_at is null;
  if v_id is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  return v_id;
end;
$$;
revoke all on function private.my_member_id(uuid) from public;

-- 날짜 범위(센터 시간대)의 수업 + 내 예약 상태
create or replace function public.member_schedule(p_center_id uuid, p_from date, p_to date)
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
  my_pass_type public.pass_type
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
         s.capacity, s.booked_count, s.waitlist_count, b.id, b.status, b.waitlist_position, mp.type
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
    and (s.starts_at at time zone v_timezone)::date between p_from and p_to
  order by s.starts_at, p.name;
end;
$$;

-- 예약 전 미리보기: 쓰일 이용권(만료 임박 순 자동 선택)과 무료 취소 기한. 쓸 수 없으면 error 코드
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
  if not found then
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
    'free_cancel_until', v_session.starts_at
      - make_interval(secs => (v_rules.free_cancel_hours_before * 3600)::double precision),
    'close_at', v_session.starts_at - make_interval(mins => v_rules.close_minutes_before)
  );
end;
$$;

-- 내 예약: 다가오는 예약(예약·대기) / 지난 기록
create or replace function public.member_bookings(p_center_id uuid, p_upcoming boolean, p_limit int default 50)
returns table (
  booking_id uuid,
  status public.booking_status,
  waitlist_position int,
  session_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  session_status public.session_status,
  cancel_reason text,
  program_name text,
  program_color text,
  instructor_name text,
  pass_name text,
  pass_type public.pass_type
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.my_member_id(p_center_id);
begin
  return query
  select b.id, b.status, b.waitlist_position, s.id, s.starts_at, s.ends_at, s.status, s.cancel_reason,
         p.name, p.color, st.name, mp.name, mp.type
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.programs p on p.id = s.program_id
  left join public.staff st on st.id = s.instructor_id
  left join public.member_passes mp on mp.id = b.member_pass_id
  where b.member_id = v_member_id
    and case when p_upcoming
      then b.status in ('booked', 'waitlisted') and s.ends_at > now()
      else not (b.status in ('booked', 'waitlisted') and s.ends_at > now())
    end
  order by
    case when p_upcoming then s.starts_at end asc,
    case when not p_upcoming then s.starts_at end desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

-- 알림 설정 (회원 본인)
create or replace function public.update_my_settings(
  p_center_id uuid,
  p_notify_enabled boolean,
  p_marketing_agreed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.my_member_id(p_center_id);
begin
  update public.members
  set notify_enabled = p_notify_enabled,
      marketing_agreed_at = case
        when not p_marketing_agreed then null
        else coalesce(marketing_agreed_at, now())
      end
  where id = v_member_id;
end;
$$;

-- "지난주와 같은 수업": 일주일 전(예약 가능 기간만큼) 내가 예약·출석한 수업과
-- 같은 프로그램·요일·시각의 이번 수업들. bookable = 지금 예약(또는 대기)할 수 있는지
create or replace function public.repeat_last_week_candidates(p_center_id uuid)
returns table (
  session_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  program_name text,
  program_color text,
  instructor_name text,
  capacity int,
  booked_count int,
  waitlist_count int,
  bookable boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.my_member_id(p_center_id);
  v_rules private.center_rules := private.center_rules(p_center_id);
  v_today date := (now() at time zone v_rules.timezone)::date;
begin
  return query
  select distinct on (s.id)
    s.id, s.starts_at, s.ends_at, p.name, p.color, st.name, s.capacity, s.booked_count, s.waitlist_count,
    (now() < s.starts_at - make_interval(mins => v_rules.close_minutes_before)) as bookable
  from public.bookings b
  join public.sessions past on past.id = b.session_id
  join public.sessions s
    on s.center_id = p_center_id
   and s.program_id = past.program_id
   and s.status = 'scheduled'
   and s.deleted_at is null
   and s.starts_at = past.starts_at + interval '7 days'
  join public.programs p on p.id = s.program_id
  left join public.staff st on st.id = s.instructor_id
  where b.member_id = v_member_id
    and b.status in ('booked', 'attended', 'no_show')
    and (s.starts_at at time zone v_rules.timezone)::date between v_today and v_today + v_rules.open_days_before
    and not exists (
      select 1 from public.bookings mine
      where mine.session_id = s.id and mine.member_id = v_member_id
        and mine.status in ('booked', 'waitlisted', 'attended', 'no_show')
    )
  order by s.id, s.starts_at;
end;
$$;

revoke all on function public.member_schedule(uuid, date, date) from public, anon;
grant execute on function public.member_schedule(uuid, date, date) to authenticated;
revoke all on function public.preview_booking(uuid) from public, anon;
grant execute on function public.preview_booking(uuid) to authenticated;
revoke all on function public.member_bookings(uuid, boolean, int) from public, anon;
grant execute on function public.member_bookings(uuid, boolean, int) to authenticated;
revoke all on function public.update_my_settings(uuid, boolean, boolean) from public, anon;
grant execute on function public.update_my_settings(uuid, boolean, boolean) to authenticated;
revoke all on function public.repeat_last_week_candidates(uuid) from public, anon;
grant execute on function public.repeat_last_week_candidates(uuid) to authenticated;
