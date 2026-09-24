-- ─────────────────────────────────────────────────────────────
-- 관리자 "오늘" 화면: 숫자 4개 · 챙겨야 할 회원 · 주간/월간 통계
-- security invoker → 직원 RLS 가 그대로 적용된다. 직원이 아니면 FORBIDDEN
-- 날짜는 모두 센터 시간대 기준
-- ─────────────────────────────────────────────────────────────

-- 재등록: 같은 회원이 이전에 받은 이용권이 있는데 새 이용권을 받은 경우
create or replace function private.is_renewal(p_pass public.member_passes)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.member_passes prev
    where prev.member_id = p_pass.member_id
      and prev.id <> p_pass.id
      and prev.deleted_at is null
      and prev.created_at < p_pass.created_at
  );
$$;
revoke all on function private.is_renewal(public.member_passes) from public;
grant execute on function private.is_renewal(public.member_passes) to authenticated;

-- 하루 운영 숫자 (기본: 오늘)
--   bookings        그날 수업의 예약 수 (예약·출석·노쇼)
--   attended        출석 수
--   attendance_base 이미 시작한 수업의 예약 수 → 출석률 = attended / attendance_base
--   new_members     그 달 1일 ~ 그날 신규 회원
--   renewals        그 달 1일 ~ 그날 재등록한 회원 수
create or replace function public.today_summary(p_center_id uuid, p_date date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tz text;
  v_date date;
  v_month_start date;
  v_bookings int;
  v_attended int;
  v_started int;
  v_new_members int;
  v_renewals int;
begin
  if not private.is_staff(p_center_id) then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  select c.timezone into v_tz from public.centers c where c.id = p_center_id;
  v_date := coalesce(p_date, (now() at time zone v_tz)::date);
  v_month_start := date_trunc('month', v_date)::date;

  select
    count(*) filter (where b.status in ('booked', 'attended', 'no_show')),
    count(*) filter (where b.status = 'attended'),
    count(*) filter (where b.status in ('booked', 'attended', 'no_show') and s.starts_at <= now())
  into v_bookings, v_attended, v_started
  from public.sessions s
  join public.bookings b on b.session_id = s.id
  where s.center_id = p_center_id
    and s.deleted_at is null
    and s.status = 'scheduled'
    and (s.starts_at at time zone v_tz)::date = v_date;

  select count(*) into v_new_members
  from public.members m
  where m.center_id = p_center_id
    and m.deleted_at is null
    and (m.joined_at at time zone v_tz)::date between v_month_start and v_date;

  select count(distinct mp.member_id) into v_renewals
  from public.member_passes mp
  where mp.center_id = p_center_id
    and mp.deleted_at is null
    and (mp.created_at at time zone v_tz)::date between v_month_start and v_date
    and private.is_renewal(mp);

  return jsonb_build_object(
    'date', v_date,
    'bookings', v_bookings,
    'attended', v_attended,
    'attendance_base', v_started,
    'new_members', v_new_members,
    'renewals', v_renewals
  );
end;
$$;

-- 챙겨야 할 회원 (다음 이용권을 이미 준비한 회원은 빼고)
--   expiring  쓸 수 있는 이용권이 7일 안에 만료
--   low       잔여 1~2회
--   inactive  이용권은 쓸 수 있는데 최근 2주 동안 출석이 없음 (이용 시작 2주 이상 된 회원만)
create or replace function public.today_followups(p_center_id uuid, p_limit int default 20)
returns table (
  reason text,
  member_id uuid,
  name text,
  phone text,
  pass_id uuid,
  pass_name text,
  days_left int,
  remaining int,
  last_attended_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date;
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
begin
  if not private.is_staff(p_center_id) then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  select (now() at time zone c.timezone)::date into v_today from public.centers c where c.id = p_center_id;

  return query
  with passes as (
    select mp.id, mp.member_id, mp.name, mp.start_date, mp.end_date, mp.remaining_count,
           private.pass_state(mp, v_today) as state
    from public.member_passes mp
    join public.members m on m.id = mp.member_id
    where mp.center_id = p_center_id
      and mp.status = 'active'
      and mp.deleted_at is null
      and m.deleted_at is null
      and m.status = 'active'
  ),
  -- 넉넉한 이용권(7일 넘게 남고 3회 이상)이 따로 있으면 이미 재등록한 것으로 본다
  renewed as (
    select distinct p.member_id
    from passes p
    where p.state in ('active', 'upcoming', 'on_hold')
      and (p.end_date is null or p.end_date > v_today + 7)
      and (p.remaining_count is null or p.remaining_count > 2)
  ),
  candidates as (
    select 'expiring'::text as reason, p.member_id, p.id as pass_id, p.name as pass_name,
           (p.end_date - v_today) as days_left, p.remaining_count as remaining,
           null::timestamptz as last_attended_at,
           (p.end_date - v_today)::numeric as urgency
    from passes p
    where p.state = 'active'
      and p.end_date between v_today and v_today + 7
      and p.member_id not in (select r.member_id from renewed r)
    union all
    select 'low', p.member_id, p.id, p.name, (p.end_date - v_today), p.remaining_count, null, p.remaining_count
    from passes p
    where p.state = 'active'
      and p.remaining_count between 1 and 2
      and p.member_id not in (select r.member_id from renewed r)
    union all
    select 'inactive', p.member_id, p.id, p.name, (p.end_date - v_today), p.remaining_count, la.last_at,
           coalesce(extract(epoch from la.last_at), 0)::numeric
    from (
      select distinct on (p.member_id) p.*
      from passes p
      where p.state = 'active' and p.start_date <= v_today - 14
      order by p.member_id, p.end_date nulls last
    ) p
    left join lateral (
      select max(s.starts_at) as last_at
      from public.bookings b
      join public.sessions s on s.id = b.session_id
      where b.member_id = p.member_id and b.status = 'attended'
    ) la on true
    where la.last_at is null or la.last_at < now() - interval '14 days'
  ),
  ranked as (
    select c.*, row_number() over (partition by c.reason order by c.urgency, c.member_id) as rn
    from candidates c
  )
  select r.reason, r.member_id, m.name, m.phone, r.pass_id, r.pass_name, r.days_left, r.remaining,
         r.last_attended_at
  from ranked r
  join public.members m on m.id = r.member_id
  where r.rn <= v_limit
  order by case r.reason when 'expiring' then 1 when 'low' then 2 else 3 end, r.rn;
end;
$$;

-- 주간/월간 통계: 최근 p_count 일(day) 또는 달(month)의 예약·출석·신규·재등록
create or replace function public.center_stats(p_center_id uuid, p_unit text, p_count int default 7)
returns table (
  bucket date,
  bookings int,
  attended int,
  new_members int,
  renewals int
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_today date;
  v_from date;
begin
  if not private.is_staff(p_center_id) then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  if p_unit not in ('day', 'month') or p_count is null or p_count not between 1 and 31 then
    perform private.raise_app_error('VALIDATION');
  end if;
  select c.timezone into v_tz from public.centers c where c.id = p_center_id;
  v_today := (now() at time zone v_tz)::date;
  v_from := case
    when p_unit = 'day' then v_today - (p_count - 1)
    else (date_trunc('month', v_today) - make_interval(months => p_count - 1))::date
  end;

  return query
  with buckets as (
    select g::date as bucket
    from generate_series(
      v_from::timestamp,
      case when p_unit = 'day' then v_today else date_trunc('month', v_today)::date end::timestamp,
      case when p_unit = 'day' then interval '1 day' else interval '1 month' end
    ) g
  ),
  booking_counts as (
    select
      case when p_unit = 'day' then (s.starts_at at time zone v_tz)::date
           else date_trunc('month', s.starts_at at time zone v_tz)::date end as bucket,
      count(*) filter (where b.status in ('booked', 'attended', 'no_show'))::int as bookings,
      count(*) filter (where b.status = 'attended')::int as attended
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where s.center_id = p_center_id
      and s.deleted_at is null
      and s.status = 'scheduled'
      and (s.starts_at at time zone v_tz)::date between v_from and v_today
    group by 1
  ),
  member_counts as (
    select
      case when p_unit = 'day' then (m.joined_at at time zone v_tz)::date
           else date_trunc('month', m.joined_at at time zone v_tz)::date end as bucket,
      count(*)::int as new_members
    from public.members m
    where m.center_id = p_center_id
      and m.deleted_at is null
      and (m.joined_at at time zone v_tz)::date between v_from and v_today
    group by 1
  ),
  renewal_counts as (
    select
      case when p_unit = 'day' then (mp.created_at at time zone v_tz)::date
           else date_trunc('month', mp.created_at at time zone v_tz)::date end as bucket,
      count(distinct mp.member_id)::int as renewals
    from public.member_passes mp
    where mp.center_id = p_center_id
      and mp.deleted_at is null
      and (mp.created_at at time zone v_tz)::date between v_from and v_today
      and private.is_renewal(mp)
    group by 1
  )
  select bu.bucket,
         coalesce(bc.bookings, 0),
         coalesce(bc.attended, 0),
         coalesce(mc.new_members, 0),
         coalesce(rc.renewals, 0)
  from buckets bu
  left join booking_counts bc on bc.bucket = bu.bucket
  left join member_counts mc on mc.bucket = bu.bucket
  left join renewal_counts rc on rc.bucket = bu.bucket
  order by bu.bucket;
end;
$$;

revoke all on function public.today_summary(uuid, date) from public, anon;
grant execute on function public.today_summary(uuid, date) to authenticated;
revoke all on function public.today_followups(uuid, int) from public, anon;
grant execute on function public.today_followups(uuid, int) to authenticated;
revoke all on function public.center_stats(uuid, text, int) from public, anon;
grant execute on function public.center_stats(uuid, text, int) to authenticated;
