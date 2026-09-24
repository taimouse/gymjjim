-- ─────────────────────────────────────────────────────────────
-- 권한 헬퍼 (RLS에서 사용) · 역할 클레임 동기화
-- ─────────────────────────────────────────────────────────────

-- 현재 로그인 사용자가 직원으로 속한 센터들
create or replace function private.staff_center_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id
  from public.staff s
  where s.user_id = (select auth.uid()) and s.deleted_at is null;
$$;

-- 현재 로그인 사용자가 대표(owner)인 센터들
create or replace function private.owner_center_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.center_id
  from public.staff s
  where s.user_id = (select auth.uid()) and s.role = 'owner' and s.deleted_at is null;
$$;

-- 현재 로그인 사용자와 연결된 회원 행들
create or replace function private.member_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.members m
  where m.user_id = (select auth.uid()) and m.deleted_at is null and m.status = 'active';
$$;

-- 현재 로그인 사용자가 회원으로 속한 센터들
create or replace function private.member_center_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.center_id
  from public.members m
  where m.user_id = (select auth.uid()) and m.deleted_at is null and m.status = 'active';
$$;

create or replace function private.is_staff(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.staff_center_ids() c where c = p_center_id);
$$;

create or replace function private.is_owner(p_center_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.owner_center_ids() c where c = p_center_id);
$$;

-- 현재 사용자의 직원 행(없으면 null)
create or replace function private.current_staff_id(p_center_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.staff s
  where s.center_id = p_center_id and s.user_id = (select auth.uid()) and s.deleted_at is null
  limit 1;
$$;

revoke all on function private.staff_center_ids() from public;
revoke all on function private.owner_center_ids() from public;
revoke all on function private.member_ids() from public;
revoke all on function private.member_center_ids() from public;
revoke all on function private.is_staff(uuid) from public;
revoke all on function private.is_owner(uuid) from public;
revoke all on function private.current_staff_id(uuid) from public;
grant execute on function private.staff_center_ids() to authenticated;
grant execute on function private.owner_center_ids() to authenticated;
grant execute on function private.member_ids() to authenticated;
grant execute on function private.member_center_ids() to authenticated;
grant execute on function private.is_staff(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;
grant execute on function private.current_staff_id(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 역할 클레임: auth.users.raw_app_meta_data.gymjjim 에 직원·회원 소속을 기록한다.
-- JWT의 app_metadata 로 전달되어 proxy.ts 가 빠르게 라우팅할 때만 쓴다.
-- 실제 권한 판단은 항상 위 헬퍼(RLS)와 RPC가 DB 기준으로 한다.
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
    ), '[]'::jsonb)
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

create or replace function private.on_role_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.sync_user_roles(new.user_id);
  elsif tg_op = 'UPDATE' then
    perform private.sync_user_roles(old.user_id);
    if new.user_id is distinct from old.user_id then
      perform private.sync_user_roles(new.user_id);
    end if;
  else
    perform private.sync_user_roles(old.user_id);
  end if;
  return null;
end;
$$;

revoke all on function private.sync_user_roles(uuid) from public;
revoke all on function private.on_role_row_change() from public;

create trigger staff_sync_roles
  after insert or delete or update of user_id, role, deleted_at on public.staff
  for each row execute function private.on_role_row_change();

create trigger members_sync_roles
  after insert or delete or update of user_id, status, deleted_at on public.members
  for each row execute function private.on_role_row_change();
