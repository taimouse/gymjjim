-- ─────────────────────────────────────────────────────────────
-- 회원 목록·검색: 대표 이용권 상태와 필터(활성 / 만료 임박 D-7 / 잔여 1~2회 / 만료 / 정지 중)
-- security invoker → 직원 RLS 가 그대로 적용된다 (다른 센터 회원은 보이지 않음)
-- ─────────────────────────────────────────────────────────────

-- 이용권 상태 (센터 기준 오늘 날짜로 계산)
create or replace function private.pass_state(p_pass public.member_passes, p_today date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_pass.status <> 'active' or p_pass.deleted_at is not null then 'cancelled'
    when p_pass.start_date > p_today then 'upcoming'
    when p_pass.end_date is not null and p_pass.end_date < p_today then 'expired'
    when p_pass.remaining_count is not null and p_pass.remaining_count <= 0 then 'exhausted'
    when exists (
      select 1 from public.pass_holds h
      where h.member_pass_id = p_pass.id and p_today between h.start_date and h.end_date
    ) then 'on_hold'
    else 'active'
  end;
$$;
revoke all on function private.pass_state(public.member_passes, date) from public;
grant execute on function private.pass_state(public.member_passes, date) to authenticated;

create or replace function public.search_members(
  p_center_id uuid,
  p_query text default null,
  p_filter text default 'all',
  p_sort text default 'name',
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  phone text,
  tags text[],
  joined_at timestamptz,
  linked boolean,
  pass_id uuid,
  pass_name text,
  pass_type public.pass_type,
  pass_state text,
  pass_end_date date,
  pass_remaining int,
  pass_days_left int,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      (now() at time zone c.timezone)::date as today,
      nullif(trim(coalesce(p_query, '')), '') as q,
      regexp_replace(coalesce(p_query, ''), '\D', '', 'g') as digits
    from public.centers c
    where c.id = p_center_id
  ),
  rows as (
    select
      m.id, m.name, m.phone, m.tags, m.joined_at, m.user_id is not null as linked,
      pp.id as pass_id, pp.name as pass_name, pp.type as pass_type, pp.state as pass_state,
      pp.end_date as pass_end_date, pp.remaining_count as pass_remaining,
      (pp.end_date - params.today) as pass_days_left
    from public.members m
    cross join params
    left join lateral (
      select mp.*, private.pass_state(mp, params.today) as state
      from public.member_passes mp
      where mp.member_id = m.id and mp.status = 'active' and mp.deleted_at is null
      order by
        -- 지금·앞으로 쓸 수 있는 이용권 → 만료 임박 순, 없으면 가장 최근에 끝난 것
        case when private.pass_state(mp, params.today) in ('active', 'on_hold', 'upcoming') then 0 else 1 end,
        case when private.pass_state(mp, params.today) in ('active', 'on_hold', 'upcoming') then mp.end_date end
          asc nulls last,
        mp.end_date desc nulls last,
        mp.created_at desc
      limit 1
    ) pp on true
    where m.center_id = p_center_id
      and m.deleted_at is null
      and m.status = 'active'
      and (
        params.q is null
        -- 숫자만 4자리: 전화번호 뒷 4자리
        or (params.q ~ '^[0-9 -]+$' and length(params.digits) = 4 and m.phone_last4 = params.digits)
        -- 숫자 5자리 이상: 전화번호 일부 (하이픈 입력 허용)
        or (params.q ~ '^[0-9 -]+$' and length(params.digits) >= 5 and m.phone like '%' || params.digits || '%')
        -- 그 외: 이름
        or (params.q !~ '^[0-9 -]+$' and m.name ilike '%' || params.q || '%')
      )
  ),
  filtered as (
    select * from rows r
    where case p_filter
      when 'active' then r.pass_state = 'active'
      when 'expiring' then r.pass_state = 'active' and r.pass_days_left between 0 and 7
      when 'low' then r.pass_state = 'active' and r.pass_remaining between 1 and 2
      when 'expired' then r.pass_state in ('expired', 'exhausted')
      when 'hold' then r.pass_state = 'on_hold'
      when 'none' then r.pass_id is null
      else true
    end
  )
  select f.*, count(*) over () as total_count
  from filtered f
  order by
    case when p_sort = 'recent' then f.joined_at end desc nulls last,
    case when p_sort = 'expiry' then f.pass_end_date end asc nulls last,
    f.name asc,
    f.id
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.search_members(uuid, text, text, text, int, int) from public, anon;
grant execute on function public.search_members(uuid, text, text, text, int, int) to authenticated;
