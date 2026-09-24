-- ─────────────────────────────────────────────────────────────
-- 회원 연결(초대 토큰) · 첫 로그인 동의 · 내 소속 조회
-- 흐름: 직원이 회원 등록 → 초대 링크(1회용, 7일) → 회원이 로그인 후 수락 → members.user_id 연결
-- ─────────────────────────────────────────────────────────────

-- 이름 가운데 마스킹: 홍길동 → 홍*동, 김철 → 김*
create or replace function private.mask_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name is null then null
    when char_length(p_name) <= 1 then '*'
    when char_length(p_name) = 2 then left(p_name, 1) || '*'
    else left(p_name, 1) || repeat('*', char_length(p_name) - 2) || right(p_name, 1)
  end;
$$;

create or replace function private.invite_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

revoke all on function private.mask_name(text) from public;
revoke all on function private.invite_token_hash(text) from public;

-- 초대 링크 만들기 (직원). 이전에 쓰지 않은 초대는 무효로 만들고, 원문 토큰은 이때 한 번만 돌려준다.
-- p_invite_url_base 를 주면 알림톡(초대 링크) 발송 대기열에 넣는다. 예: https://app.example.com/invite/
create or replace function public.create_member_invite(p_member_id uuid, p_invite_url_base text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_staff_id uuid;
  v_token text;
  v_expires_at timestamptz := now() + interval '7 days';
begin
  select * into v_member from public.members
  where id = p_member_id and status = 'active' and deleted_at is null;
  if not found then
    perform private.raise_app_error('MEMBER_NOT_FOUND');
  end if;
  v_staff_id := private.current_staff_id(v_member.center_id);
  if v_staff_id is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  if v_member.user_id is not null then
    perform private.raise_app_error('MEMBER_ALREADY_LINKED');
  end if;
  if p_invite_url_base is not null and p_invite_url_base !~ '^https?://[^\s?#]+/invite/$' then
    perform private.raise_app_error('VALIDATION');
  end if;

  update public.member_invites set revoked_at = now()
  where member_id = p_member_id and used_at is null and revoked_at is null;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.member_invites (center_id, member_id, token_hash, expires_at, created_by)
  values (v_member.center_id, p_member_id, private.invite_token_hash(v_token), v_expires_at, v_staff_id);

  if p_invite_url_base is not null then
    perform private.enqueue_notification(
      v_member.center_id, p_member_id, 'member_invite',
      jsonb_build_object(
        'invite_url', p_invite_url_base || v_token,
        'center_name', (select c.name from public.centers c where c.id = v_member.center_id),
        'member_name', v_member.name,
        'expires_at', v_expires_at
      ),
      null,
      true
    );
  end if;

  return jsonb_build_object('token', v_token, 'expires_at', v_expires_at);
end;
$$;

-- 초대 링크 확인 (로그인 전에도 호출). 센터 이름과 마스킹된 회원 이름만 알려준다.
create or replace function public.get_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.member_invites;
  v_status text;
begin
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 128 then
    return jsonb_build_object('status', 'invalid');
  end if;
  select * into v_invite from public.member_invites where token_hash = private.invite_token_hash(p_token);
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_status := case
    when v_invite.revoked_at is not null then 'invalid'
    when v_invite.used_at is not null then 'used'
    when v_invite.expires_at < now() then 'expired'
    else 'valid'
  end;
  return (
    select jsonb_build_object('status', v_status, 'center_name', c.name, 'member_name', private.mask_name(m.name))
    from public.members m
    join public.centers c on c.id = m.center_id
    where m.id = v_invite.member_id
  );
end;
$$;

-- 초대 수락: 로그인한 사용자를 회원 행에 연결한다.
create or replace function public.accept_member_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.member_invites;
  v_member public.members;
begin
  if v_uid is null then
    perform private.raise_app_error('NOT_AUTHENTICATED');
  end if;
  select * into v_invite from public.member_invites
  where token_hash = private.invite_token_hash(coalesce(p_token, ''))
  for update;
  if not found or v_invite.revoked_at is not null then
    perform private.raise_app_error('INVITE_INVALID');
  end if;

  select * into v_member from public.members where id = v_invite.member_id for update;

  if v_invite.used_at is not null then
    -- 같은 사람이 링크를 다시 연 경우(새로고침 등)는 그대로 성공 처리
    if v_invite.used_by = v_uid and v_member.user_id = v_uid then
      return jsonb_build_object('member_id', v_member.id, 'center_id', v_member.center_id,
        'onboarded', v_member.onboarded_at is not null);
    end if;
    perform private.raise_app_error('INVITE_USED');
  end if;
  if v_invite.expires_at < now() then
    perform private.raise_app_error('INVITE_EXPIRED');
  end if;
  if v_member.status <> 'active' or v_member.deleted_at is not null then
    perform private.raise_app_error('MEMBER_NOT_FOUND');
  end if;
  if v_member.user_id is not null and v_member.user_id <> v_uid then
    perform private.raise_app_error('INVITE_USED');
  end if;
  if exists (
    select 1 from public.members m
    where m.center_id = v_member.center_id and m.user_id = v_uid and m.id <> v_member.id and m.deleted_at is null
  ) then
    perform private.raise_app_error('ALREADY_MEMBER');
  end if;

  update public.members set user_id = v_uid where id = v_member.id;
  update public.member_invites set used_at = now(), used_by = v_uid where id = v_invite.id;

  return jsonb_build_object('member_id', v_member.id, 'center_id', v_member.center_id,
    'onboarded', v_member.onboarded_at is not null);
end;
$$;

-- 첫 로그인 동의: 개인정보 수집·이용(필수) + 마케팅 수신(선택) 일시 저장
create or replace function public.complete_onboarding(p_marketing_agreed boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated int;
begin
  if (select auth.uid()) is null then
    perform private.raise_app_error('NOT_AUTHENTICATED');
  end if;
  if not exists (select 1 from private.member_ids()) then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  update public.members
  set privacy_agreed_at = now(),
      marketing_agreed_at = case when p_marketing_agreed then now() end,
      onboarded_at = now()
  where id in (select private.member_ids()) and onboarded_at is null;
  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated);
end;
$$;

-- 로그인한 사용자의 회원 소속 (회원은 members 테이블을 직접 읽지 않는다)
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
  order by m.created_at;
$$;

-- 직원 초대 시 이미 가입된 이메일의 사용자 id 찾기 (서버의 service_role 전용)
create or replace function public.admin_find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(p_email) order by u.created_at limit 1;
$$;

revoke all on function public.create_member_invite(uuid, text) from public, anon;
grant execute on function public.create_member_invite(uuid, text) to authenticated;
revoke all on function public.get_invite(text) from public;
grant execute on function public.get_invite(text) to anon, authenticated;
revoke all on function public.accept_member_invite(text) from public, anon;
grant execute on function public.accept_member_invite(text) to authenticated;
revoke all on function public.complete_onboarding(boolean) from public, anon;
grant execute on function public.complete_onboarding(boolean) to authenticated;
revoke all on function public.my_memberships() from public, anon;
grant execute on function public.my_memberships() to authenticated;
revoke all on function public.admin_find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_find_user_id_by_email(text) to service_role;
