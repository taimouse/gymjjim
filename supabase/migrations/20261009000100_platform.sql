-- ─────────────────────────────────────────────────────────────
-- 운영자(플랫폼) 콘솔: 운영자 · 요금제 · 센터 이용 상태 · 청구서 · 인원 한도
--  - 운영자(platform_admins)는 모든 센터를 보고 요금제·상태·청구를 관리한다. 센터 업무 데이터는 보지 않는다
--  - 결제는 1단계로 수기 관리: 청구서를 발행하고 입금을 확인하면 '입금'으로 바꾼다
--  - 정지(suspended)·해지(closed)된 센터는 직원·회원 권한 헬퍼에서 빠지므로 RLS·RPC 가 모두 막는다
--  - 요금제의 회원·직원 한도는 트리거가 검사한다 (회원 일괄 등록도 같은 규칙)
-- ─────────────────────────────────────────────────────────────

-- trial: 체험 / active: 이용 중 / suspended: 정지(미납 등) / closed: 해지
create type public.center_status as enum ('trial', 'active', 'suspended', 'closed');
-- pending: 미납 / paid: 입금 / void: 취소
create type public.invoice_status as enum ('pending', 'paid', 'void');

-- 운영자 계정
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  created_at timestamptz not null default now()
);

-- 요금제. 한도가 null 이면 무제한
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[a-z0-9_-]{2,30}$'),
  name text not null check (char_length(name) between 1 and 50),
  monthly_price int not null check (monthly_price between 0 and 100000000),
  max_members int check (max_members between 1 and 1000000),
  max_staff int check (max_staff between 1 and 10000),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index plans_code_uniq on public.plans (code);

create trigger plans_set_updated_at before update on public.plans
  for each row execute function private.set_updated_at();

insert into public.plans (code, name, monthly_price, max_members, max_staff, sort_order) values
  ('trial', '체험', 0, 30, 2, 1),
  ('basic', '베이직', 49000, 300, 5, 2),
  ('pro', '프로', 99000, null, null, 3);

-- 센터 이용 상태 · 요금제 (plan_id 가 null 이면 한도 없음)
alter table public.centers
  add column status public.center_status not null default 'active',
  add column plan_id uuid references public.plans (id),
  add column trial_ends_at date,
  add column status_changed_at timestamptz;

create index centers_status_idx on public.centers (status) where deleted_at is null;

-- 기존 센터는 베이직 요금제로 이용 중
update public.centers set plan_id = (select p.id from public.plans p where p.code = 'basic');

-- 운영자 메모 (센터 직원에게 보이면 안 되므로 centers 와 따로 둔다)
create table public.platform_center_notes (
  center_id uuid primary key references public.centers (id),
  memo text not null default '' check (char_length(memo) <= 2000),
  updated_at timestamptz not null default now()
);

create trigger platform_center_notes_set_updated_at before update on public.platform_center_notes
  for each row execute function private.set_updated_at();

-- 청구서. 같은 센터·같은 시작일의 유효한(취소 아닌) 청구서는 하나만
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  plan_id uuid references public.plans (id),
  period_start date not null,
  period_end date not null,
  amount int not null check (amount between 0 and 100000000),
  due_date date not null,
  status public.invoice_status not null default 'pending',
  paid_at timestamptz,
  memo text check (char_length(memo) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_period_valid check (period_end >= period_start),
  constraint invoices_paid_at_valid check ((status = 'paid') = (paid_at is not null))
);

create unique index invoices_center_period_uniq on public.invoices (center_id, period_start)
  where status <> 'void';
create index invoices_status_due_idx on public.invoices (status, due_date);
create index invoices_center_idx on public.invoices (center_id, period_start desc);

create trigger invoices_set_updated_at before update on public.invoices
  for each row execute function private.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 권한 헬퍼
-- ─────────────────────────────────────────────────────────────

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;

-- 이용할 수 있는 센터 (체험·이용 중)
create or replace function private.center_usable(p_status public.center_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('trial', 'active');
$$;

-- 기존 헬퍼에서 정지·해지된 센터를 뺀다 → RLS·RPC 가 모두 막힌다
create or replace function private.staff_center_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id
  from public.staff s
  join public.centers c on c.id = s.center_id
  where s.user_id = (select auth.uid()) and s.deleted_at is null and private.center_usable(c.status);
$$;

create or replace function private.owner_center_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id
  from public.staff s
  join public.centers c on c.id = s.center_id
  where s.user_id = (select auth.uid()) and s.role = 'owner' and s.deleted_at is null
    and private.center_usable(c.status);
$$;

create or replace function private.member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members m
  join public.centers c on c.id = m.center_id
  where m.user_id = (select auth.uid()) and m.deleted_at is null and m.status = 'active'
    and private.center_usable(c.status);
$$;

create or replace function private.member_center_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.center_id
  from public.members m
  join public.centers c on c.id = m.center_id
  where m.user_id = (select auth.uid()) and m.deleted_at is null and m.status = 'active'
    and private.center_usable(c.status);
$$;

create or replace function private.current_staff_id(p_center_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.staff s
  join public.centers c on c.id = s.center_id
  where s.center_id = p_center_id and s.user_id = (select auth.uid()) and s.deleted_at is null
    and private.center_usable(c.status)
  limit 1;
$$;

-- 헬퍼를 거치지 않고 회원 소속을 직접 확인하던 함수들도 정지된 센터를 뺀다
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
  select m.id into v_id
  from public.members m
  join public.centers c on c.id = m.center_id
  where m.center_id = p_center_id and m.user_id = (select auth.uid())
    and m.status = 'active' and m.deleted_at is null and private.center_usable(c.status);
  if v_id is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  return v_id;
end;
$$;

create or replace function public.my_memberships()
returns table (
  member_id uuid,
  center_id uuid,
  center_name text,
  center_timezone text,
  name text,
  onboarded_at timestamptz,
  notify_enabled boolean,
  marketing_agreed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.center_id, c.name, c.timezone, m.name, m.onboarded_at, m.notify_enabled, m.marketing_agreed_at
  from public.members m
  join public.centers c on c.id = m.center_id
  where m.user_id = (select auth.uid()) and m.status = 'active' and m.deleted_at is null and c.deleted_at is null
    and private.center_usable(c.status)
  order by m.created_at;
$$;

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
  where m.id in (select private.member_ids()) and m.center_id = v_center_id;
  if v_member_id is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;

  return private.create_booking(p_session_id, v_member_id, p_member_pass_id, 'member', null, true, false, true);
end;
$$;

revoke all on function private.is_platform_admin() from public;
revoke all on function private.center_usable(public.center_status) from public;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.center_usable(public.center_status) to authenticated;

-- 정지된 센터에는 알림을 보내지 않는다 (예약 리마인드·만료 안내 모두 이 함수를 거친다)
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
  v_usable boolean;
  v_send boolean;
begin
  select * into v_member from public.members where id = p_member_id;
  select private.center_usable(c.status) into v_usable from public.centers c where c.id = p_center_id;
  v_usable := coalesce(v_usable, false);
  v_send := v_member.id is not null and v_member.status = 'active' and v_member.deleted_at is null
    and (p_force or v_member.notify_enabled) and v_usable;
  insert into public.notification_logs (
    center_id, member_id, type, channel, template_code, payload, status, dedupe_key, scheduled_at, error
  ) values (
    p_center_id, p_member_id, p_type, 'alimtalk', upper(p_type), p_payload,
    case when v_send then 'pending'::public.notification_status else 'skipped' end,
    p_dedupe_key, p_scheduled_at,
    case when v_send then null when not v_usable then 'CENTER_SUSPENDED' else 'NOTIFY_DISABLED' end
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 역할 클레임에 운영자 여부를 더한다 (proxy.ts 라우팅용)
-- ─────────────────────────────────────────────────────────────
create or replace function private.sync_user_roles(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles jsonb;
begin
  if p_user_id is null then
    return;
  end if;

  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('center_id', s.center_id, 'role', s.role) order by s.created_at)
      from public.staff s
      where s.user_id = p_user_id and s.deleted_at is null
    ), '[]'::jsonb),
    'member', coalesce((
      select jsonb_agg(jsonb_build_object('center_id', m.center_id, 'member_id', m.id) order by m.created_at)
      from public.members m
      where m.user_id = p_user_id and m.deleted_at is null and m.status = 'active'
    ), '[]'::jsonb),
    'platform', exists (select 1 from public.platform_admins a where a.user_id = p_user_id)
  ) into v_roles;

  begin
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('gymjjim', v_roles)
    where id = p_user_id;
  exception when insufficient_privilege then
    -- 클레임은 라우팅 최적화용이므로 실패해도 본 작업은 진행한다.
    raise warning 'sync_user_roles: cannot update auth.users (%)', sqlerrm;
  end;
end;
$$;

create trigger platform_admins_sync_roles
  after insert or delete or update of user_id on public.platform_admins
  for each row execute function private.on_role_row_change();

-- ─────────────────────────────────────────────────────────────
-- 요금제 인원 한도. 센터 행을 잠가 동시에 추가해도 한도를 넘지 않게 한다
-- ─────────────────────────────────────────────────────────────
create or replace function private.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_count int;
begin
  if tg_table_name = 'members' then
    -- 새로 활성 회원이 되는 경우만 센다 (등록 · 탈퇴/삭제 취소)
    if new.deleted_at is not null or new.status <> 'active' then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.deleted_at is null and old.status = 'active' then
      return new;
    end if;
    select p.max_members into v_limit
    from public.centers c join public.plans p on p.id = c.plan_id
    where c.id = new.center_id
    for update of c;
    if v_limit is null then
      return new;
    end if;
    select count(*) into v_count from public.members m
    where m.center_id = new.center_id and m.deleted_at is null and m.status = 'active' and m.id <> new.id;
    if v_count >= v_limit then
      perform private.raise_app_error('PLAN_MEMBER_LIMIT', jsonb_build_object('limit', v_limit));
    end if;
  else
    if new.deleted_at is not null then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.deleted_at is null then
      return new;
    end if;
    select p.max_staff into v_limit
    from public.centers c join public.plans p on p.id = c.plan_id
    where c.id = new.center_id
    for update of c;
    if v_limit is null then
      return new;
    end if;
    select count(*) into v_count from public.staff s
    where s.center_id = new.center_id and s.deleted_at is null and s.id <> new.id;
    if v_count >= v_limit then
      perform private.raise_app_error('PLAN_STAFF_LIMIT', jsonb_build_object('limit', v_limit));
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_plan_limits() from public;

create trigger members_plan_limit before insert or update of status, deleted_at on public.members
  for each row execute function private.enforce_plan_limits();
create trigger staff_plan_limit before insert or update of deleted_at on public.staff
  for each row execute function private.enforce_plan_limits();

-- ─────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────
alter table public.platform_admins enable row level security;
alter table public.plans enable row level security;
alter table public.platform_center_notes enable row level security;
alter table public.invoices enable row level security;

revoke all on table public.platform_admins, public.plans, public.platform_center_notes, public.invoices
  from anon, authenticated;
grant all on table public.platform_admins, public.plans, public.platform_center_notes, public.invoices
  to service_role;

-- 운영자 목록: 본인 행 · 운영자는 전체 조회. 추가·삭제는 DB 에서 직접 (service_role)
grant select on public.platform_admins to authenticated;
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

-- 요금제: 운영자만 조회·등록·수정 (센터는 center_plan_usage RPC 로 자기 요금제만 본다). 삭제 대신 판매 중지
grant select on public.plans to authenticated;
grant insert (code, name, monthly_price, max_members, max_staff, is_active, sort_order),
  update (code, name, monthly_price, max_members, max_staff, is_active, sort_order)
  on public.plans to authenticated;
create policy plans_select_platform on public.plans for select to authenticated
  using ((select private.is_platform_admin()));
create policy plans_insert_platform on public.plans for insert to authenticated
  with check ((select private.is_platform_admin()));
create policy plans_update_platform on public.plans for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- 운영자 메모: 운영자만 (저장은 platform_update_center)
grant select on public.platform_center_notes to authenticated;
create policy platform_center_notes_select on public.platform_center_notes for select to authenticated
  using ((select private.is_platform_admin()));

-- 청구서: 운영자 전체 조회 · 대표는 자기 센터 조회. 발행·입금 처리는 RPC 로만
grant select on public.invoices to authenticated;
create policy invoices_select on public.invoices for select to authenticated
  using ((select private.is_platform_admin()) or center_id in (select private.owner_center_ids()));

-- 센터: 운영자도 전체 조회 (상태·요금제 변경은 RPC 로만)
create policy centers_select_platform on public.centers for select to authenticated
  using ((select private.is_platform_admin()));

-- ─────────────────────────────────────────────────────────────
-- 센터용 RPC
-- ─────────────────────────────────────────────────────────────

-- 내 요금제·사용량 (직원 누구나 조회)
create or replace function public.center_plan_usage(p_center_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_staff(p_center_id) then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  select jsonb_build_object(
    'status', c.status,
    'trial_ends_at', c.trial_ends_at,
    'plan_name', p.name,
    'monthly_price', p.monthly_price,
    'max_members', p.max_members,
    'max_staff', p.max_staff,
    'member_count', (select count(*) from public.members m
                     where m.center_id = c.id and m.deleted_at is null and m.status = 'active'),
    'staff_count', (select count(*) from public.staff s where s.center_id = c.id and s.deleted_at is null)
  ) into v_result
  from public.centers c
  left join public.plans p on p.id = c.plan_id
  where c.id = p_center_id;
  return v_result;
end;
$$;

-- 로그인한 사용자가 속했지만 지금 이용할 수 없는(정지·해지) 센터. 안내 화면용
create or replace function public.my_blocked_centers()
returns table (center_id uuid, center_name text, status public.center_status, via text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.status, 'staff'::text
  from public.staff s join public.centers c on c.id = s.center_id
  where s.user_id = (select auth.uid()) and s.deleted_at is null and not private.center_usable(c.status)
  union all
  select c.id, c.name, c.status, 'member'::text
  from public.members m join public.centers c on c.id = m.center_id
  where m.user_id = (select auth.uid()) and m.deleted_at is null and m.status = 'active'
    and not private.center_usable(c.status);
$$;

-- ─────────────────────────────────────────────────────────────
-- 운영자 RPC (모두 운영자 확인 후 실행)
-- ─────────────────────────────────────────────────────────────

create or replace function private.assert_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then
    perform private.raise_app_error('FORBIDDEN');
  end if;
end;
$$;
revoke all on function private.assert_platform_admin() from public;
grant execute on function private.assert_platform_admin() to authenticated;

-- 센터 목록 (검색: 센터명·대표 이름·대표 이메일). p_center_id 를 주면 그 센터만
create or replace function public.platform_centers(
  p_query text default null,
  p_status public.center_status default null,
  p_center_id uuid default null
)
returns table (
  id uuid,
  name text,
  phone text,
  address text,
  status public.center_status,
  trial_ends_at date,
  status_changed_at timestamptz,
  created_at timestamptz,
  plan_id uuid,
  plan_name text,
  monthly_price int,
  max_members int,
  max_staff int,
  member_count int,
  staff_count int,
  owner_name text,
  owner_email text,
  owner_linked boolean,
  unpaid_count int,
  unpaid_amount bigint,
  overdue_count int,
  memo text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_query text := nullif(btrim(p_query), '');
begin
  perform private.assert_platform_admin();
  return query
  select
    c.id, c.name, c.phone, c.address, c.status, c.trial_ends_at, c.status_changed_at, c.created_at,
    c.plan_id, p.name, p.monthly_price, p.max_members, p.max_staff,
    (select count(*)::int from public.members m
     where m.center_id = c.id and m.deleted_at is null and m.status = 'active'),
    (select count(*)::int from public.staff s where s.center_id = c.id and s.deleted_at is null),
    o.name, o.email, o.user_id is not null,
    coalesce(i.unpaid_count, 0), coalesce(i.unpaid_amount, 0)::bigint, coalesce(i.overdue_count, 0),
    coalesce(n.memo, '')
  from public.centers c
  left join public.plans p on p.id = c.plan_id
  left join public.platform_center_notes n on n.center_id = c.id
  left join lateral (
    select s.name, s.email, s.user_id from public.staff s
    where s.center_id = c.id and s.role = 'owner' and s.deleted_at is null
    order by s.created_at limit 1
  ) o on true
  left join lateral (
    select count(*)::int as unpaid_count,
           sum(iv.amount)::bigint as unpaid_amount,
           count(*) filter (where iv.due_date < v_today)::int as overdue_count
    from public.invoices iv where iv.center_id = c.id and iv.status = 'pending'
  ) i on true
  where c.deleted_at is null
    and (p_center_id is null or c.id = p_center_id)
    and (p_status is null or c.status = p_status)
    and (v_query is null
         or c.name ilike '%' || v_query || '%'
         or o.name ilike '%' || v_query || '%'
         or o.email ilike '%' || v_query || '%')
  order by c.created_at desc;
end;
$$;

-- 새 센터 등록: 센터 + 대표 직원 행(초대 전). 초대 메일과 계정 연결은 서버 액션이 한다
create or replace function public.platform_create_center(
  p_name text,
  p_plan_id uuid,
  p_status public.center_status,
  p_owner_name text,
  p_owner_email text,
  p_phone text default null,
  p_address text default null,
  p_trial_ends_at date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
  v_staff_id uuid;
begin
  perform private.assert_platform_admin();
  if not exists (select 1 from public.plans p where p.id = p_plan_id) then
    perform private.raise_app_error('PLAN_NOT_FOUND');
  end if;
  if p_status not in ('trial', 'active') then
    perform private.raise_app_error('INVALID_STATUS');
  end if;

  insert into public.centers (name, phone, address, plan_id, status, trial_ends_at, status_changed_at)
  values (btrim(p_name), nullif(p_phone, ''), nullif(btrim(coalesce(p_address, '')), ''), p_plan_id, p_status,
    case when p_status = 'trial' then p_trial_ends_at end, now())
  returning id into v_center_id;

  insert into public.staff (center_id, role, name, email, color)
  values (v_center_id, 'owner', btrim(p_owner_name), lower(btrim(p_owner_email)), '#4F46E5')
  returning id into v_staff_id;

  return jsonb_build_object('center_id', v_center_id, 'staff_id', v_staff_id);
end;
$$;

-- 센터 요금제·상태·체험 종료일·메모 변경
create or replace function public.platform_update_center(
  p_center_id uuid,
  p_plan_id uuid,
  p_status public.center_status,
  p_trial_ends_at date default null,
  p_memo text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_center public.centers;
begin
  perform private.assert_platform_admin();
  select * into v_center from public.centers c where c.id = p_center_id and c.deleted_at is null for update;
  if v_center.id is null then
    perform private.raise_app_error('CENTER_NOT_FOUND');
  end if;
  if p_plan_id is not null and not exists (select 1 from public.plans p where p.id = p_plan_id) then
    perform private.raise_app_error('PLAN_NOT_FOUND');
  end if;

  update public.centers c set
    plan_id = p_plan_id,
    status = p_status,
    trial_ends_at = case when p_status = 'trial' then p_trial_ends_at end,
    status_changed_at = case when c.status is distinct from p_status then now() else c.status_changed_at end
  where c.id = p_center_id;

  if p_memo is not null then
    insert into public.platform_center_notes (center_id, memo) values (p_center_id, p_memo)
    on conflict (center_id) do update set memo = excluded.memo;
  end if;

  return jsonb_build_object('previous_status', v_center.status, 'status', p_status);
end;
$$;

-- 청구서 한 장 발행 (요금제 금액과 다르게 청구할 때도)
create or replace function public.platform_create_invoice(
  p_center_id uuid,
  p_period_start date,
  p_period_end date,
  p_amount int,
  p_due_date date,
  p_memo text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_id uuid;
begin
  perform private.assert_platform_admin();
  select c.plan_id into v_plan_id from public.centers c where c.id = p_center_id and c.deleted_at is null;
  if not found then
    perform private.raise_app_error('CENTER_NOT_FOUND');
  end if;
  if p_period_end < p_period_start then
    perform private.raise_app_error('INVALID_DATE_RANGE');
  end if;
  if exists (select 1 from public.invoices i
             where i.center_id = p_center_id and i.period_start = p_period_start and i.status <> 'void') then
    perform private.raise_app_error('INVOICE_EXISTS');
  end if;
  insert into public.invoices (center_id, plan_id, period_start, period_end, amount, due_date, memo)
  values (p_center_id, v_plan_id, p_period_start, p_period_end, p_amount, p_due_date,
    nullif(btrim(coalesce(p_memo, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- 한 달치 청구서 일괄 발행: 이용 중이고 유료 요금제인 센터 중 그 달 청구서가 없는 곳. 납부 기한은 그 달 10일
create or replace function public.platform_issue_monthly_invoices(p_month date)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_count int;
begin
  perform private.assert_platform_admin();
  insert into public.invoices (center_id, plan_id, period_start, period_end, amount, due_date)
  select c.id, p.id, v_start, v_end, p.monthly_price, v_start + 9
  from public.centers c
  join public.plans p on p.id = c.plan_id
  where c.deleted_at is null
    and c.status = 'active'
    and p.monthly_price > 0
    and not exists (select 1 from public.invoices i
                    where i.center_id = c.id and i.period_start = v_start and i.status <> 'void');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 청구서 상태 변경 (입금 · 미납으로 되돌리기 · 취소). 이전 상태를 돌려줘서 화면에서 되돌릴 수 있다
create or replace function public.platform_set_invoice_status(
  p_invoice_id uuid,
  p_status public.invoice_status,
  p_paid_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  perform private.assert_platform_admin();
  select * into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if v_invoice.id is null then
    perform private.raise_app_error('INVOICE_NOT_FOUND');
  end if;
  -- 취소한 청구서를 되살릴 때 같은 기간의 다른 청구서가 있으면 막는다
  if v_invoice.status = 'void' and p_status <> 'void' and exists (
    select 1 from public.invoices i
    where i.center_id = v_invoice.center_id and i.period_start = v_invoice.period_start
      and i.status <> 'void' and i.id <> v_invoice.id
  ) then
    perform private.raise_app_error('INVOICE_EXISTS');
  end if;

  update public.invoices set
    status = p_status,
    paid_at = case when p_status = 'paid' then coalesce(p_paid_at, v_invoice.paid_at, now()) end
  where id = p_invoice_id;

  return jsonb_build_object(
    'previous_status', v_invoice.status,
    'previous_paid_at', v_invoice.paid_at,
    'status', p_status
  );
end;
$$;

-- 대시보드 숫자 (p_month 의 청구·입금, 지금 기준 연체, 월 반복 매출, 체험 만료 임박)
create or replace function public.platform_summary(p_month date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_start date := date_trunc('month', coalesce(p_month, v_today))::date;
  v_result jsonb;
begin
  perform private.assert_platform_admin();
  select jsonb_build_object(
    'month', v_start,
    'centers', (
      select jsonb_build_object(
        'trial', count(*) filter (where c.status = 'trial'),
        'active', count(*) filter (where c.status = 'active'),
        'suspended', count(*) filter (where c.status = 'suspended'),
        'closed', count(*) filter (where c.status = 'closed'))
      from public.centers c where c.deleted_at is null),
    'billed', (select coalesce(sum(i.amount), 0) from public.invoices i
               where i.period_start = v_start and i.status <> 'void'),
    'paid', (select coalesce(sum(i.amount), 0) from public.invoices i
             where i.period_start = v_start and i.status = 'paid'),
    'unpaid', (select coalesce(sum(i.amount), 0) from public.invoices i
               where i.period_start = v_start and i.status = 'pending'),
    'overdue_count', (select count(*) from public.invoices i where i.status = 'pending' and i.due_date < v_today),
    'overdue_amount', (select coalesce(sum(i.amount), 0) from public.invoices i
                       where i.status = 'pending' and i.due_date < v_today),
    'mrr', (select coalesce(sum(p.monthly_price), 0) from public.centers c join public.plans p on p.id = c.plan_id
            where c.deleted_at is null and c.status = 'active'),
    'trial_ending', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'trial_ends_at', c.trial_ends_at)
                       order by c.trial_ends_at)
      from public.centers c
      where c.deleted_at is null and c.status = 'trial'
        and c.trial_ends_at is not null and c.trial_ends_at <= v_today + 7), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.center_plan_usage(uuid) from public, anon;
revoke all on function public.my_blocked_centers() from public, anon;
revoke all on function public.platform_centers(text, public.center_status, uuid) from public, anon;
revoke all on function public.platform_create_center(text, uuid, public.center_status, text, text, text, text, date)
  from public, anon;
revoke all on function public.platform_update_center(uuid, uuid, public.center_status, date, text) from public, anon;
revoke all on function public.platform_create_invoice(uuid, date, date, int, date, text) from public, anon;
revoke all on function public.platform_issue_monthly_invoices(date) from public, anon;
revoke all on function public.platform_set_invoice_status(uuid, public.invoice_status, timestamptz)
  from public, anon;
revoke all on function public.platform_summary(date) from public, anon;

grant execute on function public.center_plan_usage(uuid) to authenticated;
grant execute on function public.my_blocked_centers() to authenticated;
grant execute on function public.platform_centers(text, public.center_status, uuid) to authenticated;
grant execute on function public.platform_create_center(text, uuid, public.center_status, text, text, text, text, date)
  to authenticated;
grant execute on function public.platform_update_center(uuid, uuid, public.center_status, date, text) to authenticated;
grant execute on function public.platform_create_invoice(uuid, date, date, int, date, text) to authenticated;
grant execute on function public.platform_issue_monthly_invoices(date) to authenticated;
grant execute on function public.platform_set_invoice_status(uuid, public.invoice_status, timestamptz)
  to authenticated;
grant execute on function public.platform_summary(date) to authenticated;
