-- ─────────────────────────────────────────────────────────────
-- 공개 예약: 프로그램·수업을 정해 둔 시각부터 회원에게 보여준다.
-- publish_at 이 null 이면 바로 공개. 공개 전에는 직원만 보고, 회원 조회·예약 RPC 에서 빠진다.
-- (관리자 대리 예약은 오픈 규칙과 마찬가지로 공개 여부를 따지지 않는다)
-- ─────────────────────────────────────────────────────────────

alter table public.programs add column publish_at timestamptz;
alter table public.sessions add column publish_at timestamptz;

comment on column public.programs.publish_at is '회원에게 공개되는 시각. null = 바로 공개';
comment on column public.sessions.publish_at is '회원에게 공개되는 시각. null = 바로 공개';

-- 수업과 그 프로그램이 모두 공개됐는지
create or replace function private.is_published(p_session_publish_at timestamptz, p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_session_publish_at, '-infinity'::timestamptz) <= now()
     and not exists (
       select 1 from public.programs p where p.id = p_program_id and p.publish_at > now()
     );
$$;
revoke all on function private.is_published(timestamptz, uuid) from public;
grant execute on function private.is_published(timestamptz, uuid) to authenticated;

grant insert (publish_at) on public.sessions to authenticated;

-- RLS: 회원은 공개된 프로그램·수업만 본다 (Realtime 도 같은 정책을 따른다)
drop policy programs_select on public.programs;
create policy programs_select on public.programs for select to authenticated
  using (
    center_id in (select private.staff_center_ids())
    or (
      center_id in (select private.member_center_ids())
      and coalesce(publish_at, '-infinity'::timestamptz) <= now()
    )
  );

drop policy sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
  using (
    center_id in (select private.staff_center_ids())
    or (
      deleted_at is null
      and center_id in (select private.member_center_ids())
      and private.is_published(publish_at, program_id)
    )
  );

-- 회원 시간표: 공개된 수업만
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
    and coalesce(s.publish_at, '-infinity'::timestamptz) <= now()
    and coalesce(p.publish_at, '-infinity'::timestamptz) <= now()
    and (s.starts_at at time zone v_timezone)::date between p_from and p_to
  order by s.starts_at, p.name;
end;
$$;

-- "지난주와 같은 수업": 공개된 수업만
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
    and coalesce(s.publish_at, '-infinity'::timestamptz) <= now()
    and coalesce(p.publish_at, '-infinity'::timestamptz) <= now()
    and (s.starts_at at time zone v_rules.timezone)::date between v_today and v_today + v_rules.open_days_before
    and not exists (
      select 1 from public.bookings mine
      where mine.session_id = s.id and mine.member_id = v_member_id
        and mine.status in ('booked', 'waitlisted', 'attended', 'no_show')
    )
  order by s.id, s.starts_at;
end;
$$;

-- 회원 예약 미리보기: 공개 전 수업은 없는 수업처럼
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
    'free_cancel_until', v_session.starts_at
      - make_interval(secs => (v_rules.free_cancel_hours_before * 3600)::double precision),
    'close_at', v_session.starts_at - make_interval(mins => v_rules.close_minutes_before)
  );
end;
$$;

-- 회원 본인 예약 (20261009000100_platform 버전 + 공개 전 수업은 BOOKING_NOT_OPEN)
create or replace function public.book_session(p_session_id uuid, p_member_pass_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
  v_member_id uuid;
  v_publish_at timestamptz;
  v_program_id uuid;
begin
  if (select auth.uid()) is null then
    perform private.raise_app_error('NOT_AUTHENTICATED');
  end if;

  select s.center_id, s.publish_at, s.program_id into v_center_id, v_publish_at, v_program_id
  from public.sessions s where s.id = p_session_id and s.deleted_at is null;
  if v_center_id is null then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;

  -- member_ids() 는 정지·해지 센터를 뺀다 (20261009000100_platform)
  select m.id into v_member_id
  from public.members m
  where m.id in (select private.member_ids()) and m.center_id = v_center_id;
  if v_member_id is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;

  if not private.is_published(v_publish_at, v_program_id) then
    perform private.raise_app_error('BOOKING_NOT_OPEN');
  end if;

  return private.create_booking(p_session_id, v_member_id, p_member_pass_id, 'member', null, true, false, true);
end;
$$;

-- 프로그램 저장: 공개 시각(p_publish_at) 추가
drop function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text);

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
  p_publish_at timestamptz default null
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
      publish_at, sort_order
    )
    values (
      p_center_id, p_name, p_type, p_default_capacity, p_duration_min, p_color, p_default_instructor_id,
      nullif(trim(p_description), ''), p_publish_at,
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
        publish_at = p_publish_at
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
  timestamptz) from public, anon;
grant execute on function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text,
  timestamptz) to authenticated;

-- 수업 공개 시각 바꾸기 (직원). scope = this(이 수업만) | following(같은 반복의 이후 수업 전체)
-- p_publish_at 이 null 이면 바로 공개. 바뀐 수업 수를 돌려준다
create or replace function public.set_session_publish_at(
  p_session_id uuid,
  p_scope text,
  p_publish_at timestamptz default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_count int;
begin
  if p_scope not in ('this', 'following') then
    perform private.raise_app_error('VALIDATION');
  end if;
  select * into v_session from public.sessions where id = p_session_id and deleted_at is null;
  if not found then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;
  if private.current_staff_id(v_session.center_id) is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;

  update public.sessions s
  set publish_at = p_publish_at
  where s.center_id = v_session.center_id
    and s.deleted_at is null
    and (
      s.id = v_session.id
      or (
        p_scope = 'following'
        and v_session.recurrence_group_id is not null
        and s.recurrence_group_id = v_session.recurrence_group_id
        and s.starts_at >= v_session.starts_at
      )
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.set_session_publish_at(uuid, text, timestamptz) from public, anon;
grant execute on function public.set_session_publish_at(uuid, text, timestamptz) to authenticated;
