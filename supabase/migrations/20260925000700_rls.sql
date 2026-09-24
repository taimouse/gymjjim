-- ─────────────────────────────────────────────────────────────
-- RLS · 권한
-- 원칙
--  - anon 은 어떤 업무 테이블에도 접근하지 않는다.
--  - staff 는 자기 센터만, member 는 본인 데이터만.
--  - 예약·취소·출석·폐강·정지 같은 상태 변경은 RPC(security definer)로만 한다.
--  - 직접 쓰기가 허용된 테이블도 컬럼 단위로 허용 범위를 좁힌다.
-- ─────────────────────────────────────────────────────────────

alter table public.centers enable row level security;
alter table public.staff enable row level security;
alter table public.members enable row level security;
alter table public.pass_products enable row level security;
alter table public.member_passes enable row level security;
alter table public.pass_holds enable row level security;
alter table public.programs enable row level security;
alter table public.program_allowed_products enable row level security;
alter table public.sessions enable row level security;
alter table public.bookings enable row level security;
alter table public.member_invites enable row level security;
alter table public.notification_logs enable row level security;

revoke all on table
  public.centers, public.staff, public.members, public.pass_products, public.member_passes,
  public.pass_holds, public.programs, public.program_allowed_products, public.sessions,
  public.bookings, public.member_invites, public.notification_logs
from anon, authenticated;

grant all on table
  public.centers, public.staff, public.members, public.pass_products, public.member_passes,
  public.pass_holds, public.programs, public.program_allowed_products, public.sessions,
  public.bookings, public.member_invites, public.notification_logs
to service_role;

-- centers: 소속 직원·회원 조회, 대표만 수정
grant select on public.centers to authenticated;
grant update (name, timezone, phone, address, booking_settings) on public.centers to authenticated;
create policy centers_select on public.centers for select to authenticated
  using (id in (select private.staff_center_ids()) or id in (select private.member_center_ids()));
create policy centers_update_owner on public.centers for update to authenticated
  using (id in (select private.owner_center_ids()))
  with check (id in (select private.owner_center_ids()));

-- staff: 같은 센터 직원 조회, 대표만 등록·수정
grant select on public.staff to authenticated;
grant insert (center_id, role, name, email, phone, color) on public.staff to authenticated;
grant update (role, name, email, phone, color, deleted_at) on public.staff to authenticated;
create policy staff_select on public.staff for select to authenticated
  using (center_id in (select private.staff_center_ids()));
create policy staff_insert_owner on public.staff for insert to authenticated
  with check (center_id in (select private.owner_center_ids()));
create policy staff_update_owner on public.staff for update to authenticated
  using (center_id in (select private.owner_center_ids()))
  with check (center_id in (select private.owner_center_ids()));

-- members: 직원만 직접 조회·등록·수정 (회원 본인은 RPC로 필요한 필드만 본다 — 메모·태그는 내부 정보)
grant select on public.members to authenticated;
grant insert (center_id, name, phone, birth, gender, memo, tags, joined_at, privacy_agreed_at,
  marketing_agreed_at, notify_enabled) on public.members to authenticated;
grant update (name, phone, birth, gender, memo, tags, joined_at, privacy_agreed_at,
  marketing_agreed_at, notify_enabled) on public.members to authenticated;
create policy members_select_staff on public.members for select to authenticated
  using (center_id in (select private.staff_center_ids()));
create policy members_insert_staff on public.members for insert to authenticated
  with check (center_id in (select private.staff_center_ids()));
create policy members_update_staff on public.members for update to authenticated
  using (center_id in (select private.staff_center_ids()))
  with check (center_id in (select private.staff_center_ids()));

-- pass_products: 직원 조회, 대표만 등록·수정(삭제는 deleted_at)
grant select, insert, update on public.pass_products to authenticated;
create policy pass_products_select on public.pass_products for select to authenticated
  using (center_id in (select private.staff_center_ids()));
create policy pass_products_insert_owner on public.pass_products for insert to authenticated
  with check (center_id in (select private.owner_center_ids()));
create policy pass_products_update_owner on public.pass_products for update to authenticated
  using (center_id in (select private.owner_center_ids()))
  with check (center_id in (select private.owner_center_ids()));

-- member_passes: 직원·본인 조회. 부여는 RPC, 수정(만료일·횟수 조정·환불)은 대표만
grant select on public.member_passes to authenticated;
grant update (end_date, total_count, remaining_count, status, paid_amount, paid_at, memo, deleted_at)
  on public.member_passes to authenticated;
create policy member_passes_select on public.member_passes for select to authenticated
  using (center_id in (select private.staff_center_ids()) or member_id in (select private.member_ids()));
create policy member_passes_update_owner on public.member_passes for update to authenticated
  using (center_id in (select private.owner_center_ids()))
  with check (center_id in (select private.owner_center_ids()));

-- pass_holds: 직원·본인 이용권 조회. 등록은 RPC(create_hold)
grant select on public.pass_holds to authenticated;
create policy pass_holds_select on public.pass_holds for select to authenticated
  using (
    center_id in (select private.staff_center_ids())
    or member_pass_id in (
      select mp.id from public.member_passes mp where mp.member_id in (select private.member_ids())
    )
  );

-- programs: 직원·회원 조회, 대표만 등록·수정
grant select, insert, update on public.programs to authenticated;
create policy programs_select on public.programs for select to authenticated
  using (center_id in (select private.staff_center_ids()) or center_id in (select private.member_center_ids()));
create policy programs_insert_owner on public.programs for insert to authenticated
  with check (center_id in (select private.owner_center_ids()));
create policy programs_update_owner on public.programs for update to authenticated
  using (center_id in (select private.owner_center_ids()))
  with check (center_id in (select private.owner_center_ids()));

-- program_allowed_products: 직원 조회, 대표만 연결·해제
grant select, insert, delete on public.program_allowed_products to authenticated;
create policy program_allowed_products_select on public.program_allowed_products for select to authenticated
  using (center_id in (select private.staff_center_ids()));
create policy program_allowed_products_insert_owner on public.program_allowed_products for insert
  to authenticated with check (center_id in (select private.owner_center_ids()));
create policy program_allowed_products_delete_owner on public.program_allowed_products for delete
  to authenticated using (center_id in (select private.owner_center_ids()));

-- sessions: 직원·회원 조회(회원은 삭제되지 않은 수업만). 생성은 직원, 변경·폐강은 RPC
grant select on public.sessions to authenticated;
grant insert (center_id, program_id, instructor_id, starts_at, ends_at, capacity, recurrence_group_id,
  note, created_by) on public.sessions to authenticated;
create policy sessions_select on public.sessions for select to authenticated
  using (
    center_id in (select private.staff_center_ids())
    or (deleted_at is null and center_id in (select private.member_center_ids()))
  );
create policy sessions_insert_staff on public.sessions for insert to authenticated
  with check (center_id in (select private.staff_center_ids()));

-- bookings: 직원·본인 조회만. 쓰기는 예약 엔진 RPC
grant select on public.bookings to authenticated;
create policy bookings_select on public.bookings for select to authenticated
  using (center_id in (select private.staff_center_ids()) or member_id in (select private.member_ids()));

-- member_invites · notification_logs: 직원 조회만
grant select on public.member_invites to authenticated;
create policy member_invites_select_staff on public.member_invites for select to authenticated
  using (center_id in (select private.staff_center_ids()));

grant select on public.notification_logs to authenticated;
create policy notification_logs_select_staff on public.notification_logs for select to authenticated
  using (center_id in (select private.staff_center_ids()));

-- 마지막 대표는 강등·삭제할 수 없다
create or replace function private.ensure_owner_remains()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner' and old.deleted_at is null
     and (new.role <> 'owner' or new.deleted_at is not null)
     and not exists (
       select 1 from public.staff s
       where s.center_id = old.center_id and s.id <> old.id and s.role = 'owner' and s.deleted_at is null
     ) then
    perform private.raise_app_error('LAST_OWNER');
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_owner_remains() from public;

create trigger staff_ensure_owner_remains before update of role, deleted_at on public.staff
  for each row execute function private.ensure_owner_remains();

-- Realtime: 세션 카운터·예약 변화를 다른 기기에 실시간 반영
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sessions, public.bookings;
  end if;
end;
$$;
