-- ─────────────────────────────────────────────────────────────
-- 예약 엔진 내부 헬퍼 (private). 공개 RPC 는 다음 마이그레이션들에 있다.
-- 잠금 순서: 회원(advisory) → 세션(FOR UPDATE) → 예약 → 이용권(FOR UPDATE)
-- ─────────────────────────────────────────────────────────────

alter table public.sessions add column cancel_reason text check (char_length(cancel_reason) <= 200);

-- 센터 예약 규칙
create type private.center_rules as (
  timezone text,
  open_days_before int,
  close_minutes_before int,
  free_cancel_hours_before numeric,
  auto_promote_waitlist boolean
);

create or replace function private.center_rules(p_center_id uuid)
returns private.center_rules
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.timezone,
    round((c.booking_settings ->> 'open_days_before')::numeric)::int,
    round((c.booking_settings ->> 'close_minutes_before')::numeric)::int,
    (c.booking_settings ->> 'free_cancel_hours_before')::numeric,
    (c.booking_settings ->> 'auto_promote_waitlist')::boolean
  from public.centers c
  where c.id = p_center_id;
$$;

-- 이 이용권을 이 세션에 쓸 수 있으면 null, 아니면 에러 코드.
-- p_exclude_booking_id: 기간 내 횟수를 셀 때 제외할 예약(대기 승격 대상 자신)
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

-- 쓸 수 없는 이용권들 중 회원에게 가장 도움이 되는 사유를 고르기 위한 우선순위
create or replace function private.pass_error_rank(p_code text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_code
    when 'PERIOD_LIMIT_REACHED' then 1
    when 'PASS_ON_HOLD' then 2
    when 'PASS_EXHAUSTED' then 3
    when 'PASS_EXPIRED' then 4
    when 'PASS_NOT_STARTED' then 5
    else 9
  end;
$$;

-- 회원의 이용권 중 이 세션에 쓸 수 있는 것을 만료 임박 순으로 고른다.
-- 없으면 pass_id 는 null, error_code 에 사유.
create or replace function private.pick_pass(
  p_member_id uuid,
  p_session public.sessions,
  p_local_date date,
  p_timezone text,
  p_exclude_booking_id uuid default null,
  out pass_id uuid,
  out error_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pass public.member_passes;
  v_error text;
begin
  for v_pass in
    select mp.*
    from public.member_passes mp
    where mp.member_id = p_member_id
      and mp.center_id = p_session.center_id
      and mp.status = 'active'
      and mp.deleted_at is null
    order by mp.end_date asc nulls last, mp.created_at asc
  loop
    v_error := private.pass_error(v_pass, p_session, p_local_date, p_timezone, p_exclude_booking_id);
    if v_error is null then
      pass_id := v_pass.id;
      error_code := null;
      return;
    end if;
    if error_code is null or private.pass_error_rank(v_error) < private.pass_error_rank(error_code) then
      error_code := v_error;
    end if;
  end loop;
  pass_id := null;
  -- 허용되지 않은 상품뿐이면 "쓸 수 있는 이용권 없음"
  if error_code is null or error_code = 'PASS_NOT_ALLOWED' then
    error_code := 'NO_VALID_PASS';
  end if;
end;
$$;

-- 알림 아웃박스에 쌓는다. p_force = true 면 회원 알림 설정과 관계없이 발송(폐강·변경)
create or replace function private.enqueue_notification(
  p_center_id uuid,
  p_member_id uuid,
  p_type text,
  p_payload jsonb,
  p_dedupe_key text default null,
  p_force boolean default false,
  p_scheduled_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_send boolean;
begin
  select * into v_member from public.members where id = p_member_id;
  v_send := v_member.id is not null and v_member.status = 'active' and v_member.deleted_at is null
    and (p_force or v_member.notify_enabled);
  insert into public.notification_logs (
    center_id, member_id, type, channel, template_code, payload, status, dedupe_key, scheduled_at, error
  ) values (
    p_center_id, p_member_id, p_type, 'alimtalk', upper(p_type), p_payload,
    case when v_send then 'pending'::public.notification_status else 'skipped' end,
    p_dedupe_key, p_scheduled_at,
    case when v_send then null else 'NOTIFY_DISABLED' end
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

-- 알림 문구에 필요한 세션 정보
create or replace function private.session_payload(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'session_id', s.id,
    'program_name', p.name,
    'starts_at', s.starts_at,
    'ends_at', s.ends_at,
    'timezone', c.timezone,
    'center_name', c.name,
    'instructor_name', st.name
  )
  from public.sessions s
  join public.programs p on p.id = s.program_id
  join public.centers c on c.id = s.center_id
  left join public.staff st on st.id = s.instructor_id
  where s.id = p_session_id;
$$;

-- 이용권 1회 차감(횟수권만). 차감했으면 true. 잔여 1회가 되면 안내 알림
create or replace function private.deduct_pass(p_pass_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.member_passes;
begin
  select * into v_pass from public.member_passes where id = p_pass_id for update;
  if v_pass.remaining_count is null then
    return false;
  end if;
  if v_pass.remaining_count <= 0 then
    perform private.raise_app_error('PASS_EXHAUSTED');
  end if;
  update public.member_passes set remaining_count = remaining_count - 1 where id = p_pass_id;
  if v_pass.remaining_count - 1 = 1 then
    perform private.enqueue_notification(
      v_pass.center_id, v_pass.member_id, 'pass_remaining_one',
      jsonb_build_object('member_pass_id', v_pass.id, 'pass_name', v_pass.name, 'remaining_count', 1,
        'end_date', v_pass.end_date),
      'pass_remaining_one:' || v_pass.id
    );
  end if;
  return true;
end;
$$;

-- 차감했던 1회를 되돌린다
create or replace function private.restore_pass(p_pass_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.member_passes where id = p_pass_id for update;
  update public.member_passes
  set remaining_count = least(remaining_count + 1, total_count)
  where id = p_pass_id and remaining_count is not null;
end;
$$;

revoke all on function private.center_rules(uuid) from public;
revoke all on function private.pass_error(public.member_passes, public.sessions, date, text, uuid) from public;
revoke all on function private.pass_error_rank(text) from public;
revoke all on function private.pick_pass(uuid, public.sessions, date, text, uuid) from public;
revoke all on function private.enqueue_notification(uuid, uuid, text, jsonb, text, boolean, timestamptz) from public;
revoke all on function private.session_payload(uuid) from public;
revoke all on function private.deduct_pass(uuid) from public;
revoke all on function private.restore_pass(uuid) from public;
