-- ─────────────────────────────────────────────────────────────
-- 웹 푸시 구독 (PWA · 알림톡 보조 채널)
-- 회원이 기기마다 켠다. 기기 토큰이라 이력 가치가 없어서 끄거나 만료되면 바로 지운다(soft delete 대상 아님)
-- ─────────────────────────────────────────────────────────────

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  member_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_member_fk foreign key (member_id, center_id)
    references public.members (id, center_id),
  constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://')
);

create unique index push_subscriptions_endpoint_uniq on public.push_subscriptions (endpoint);
create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select on public.push_subscriptions to authenticated;
-- 회원 본인 것만 보인다. 등록·삭제는 아래 RPC 로만
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated
  using (member_id in (select private.member_ids()));

-- 이 기기 구독 저장 (같은 기기를 다른 회원이 쓰면 그 회원 것으로 옮긴다)
create or replace function public.save_push_subscription(
  p_center_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.my_member_id(p_center_id);
begin
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 2000
     or length(coalesce(p_p256dh, '')) not between 20 and 200
     or length(coalesce(p_auth, '')) not between 8 and 100 then
    perform private.raise_app_error('VALIDATION');
  end if;
  insert into public.push_subscriptions (center_id, member_id, endpoint, p256dh, auth, user_agent)
  values (p_center_id, v_member_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
  set center_id = excluded.center_id,
      member_id = excluded.member_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      created_at = now();
end;
$$;

-- 이 기기 구독 해제 (본인 것만)
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and member_id in (select private.member_ids());
$$;

-- 만료된 구독 정리 (발송 중 404·410 을 받은 주소) — service_role 전용
create or replace function public.remove_push_subscriptions(p_endpoints text[])
returns int
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    delete from public.push_subscriptions where endpoint = any (p_endpoints) returning 1
  )
  select count(*)::int from deleted;
$$;

revoke all on function public.save_push_subscription(uuid, text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(uuid, text, text, text, text) to authenticated;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;
revoke all on function public.remove_push_subscriptions(text[]) from public, anon, authenticated;
grant execute on function public.remove_push_subscriptions(text[]) to service_role;

-- 발송 대기열에서 회원의 푸시 구독도 함께 돌려준다 (반환 형태가 바뀌어 다시 만든다)
drop function public.claim_notifications(int, uuid);

create function public.claim_notifications(p_limit int default 50, p_center_id uuid default null)
returns table (
  id uuid,
  center_id uuid,
  member_id uuid,
  type text,
  template_code text,
  payload jsonb,
  attempts int,
  member_name text,
  phone text,
  center_name text,
  center_timezone text,
  sms_fallback boolean,
  push_subscriptions jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_log public.notification_logs;
  v_member public.members;
  v_center public.centers;
  v_reason text;
begin
  -- 발송 중에 멈춘 건(함수 시간 초과 등)은 10분 뒤 다시 시도하고, 3번 넘으면 실패로 둔다
  update public.notification_logs l
  set status = case when l.attempts >= 3 then 'failed'::public.notification_status else 'pending' end,
      error = coalesce(l.error, 'TIMEOUT'),
      locked_at = null
  where l.status = 'sending'
    and l.locked_at < now() - interval '10 minutes'
    and (p_center_id is null or l.center_id = p_center_id);

  for v_log in
    select * from public.notification_logs l
    where l.status = 'pending'
      and l.scheduled_at <= now()
      and (p_center_id is null or l.center_id = p_center_id)
    order by l.scheduled_at, l.created_at
    limit least(greatest(coalesce(p_limit, 50), 1), 500)
    for update skip locked
  loop
    select * into v_member from public.members m where m.id = v_log.member_id;
    v_reason := private.notification_stale_reason(v_log);
    if v_reason is null and (v_member.id is null or v_member.phone is null
        or v_member.status <> 'active' or v_member.deleted_at is not null) then
      v_reason := 'NO_RECIPIENT';
    end if;
    if v_reason is not null then
      update public.notification_logs l
      set status = 'skipped',
          error = v_reason,
          payload = case when l.type = 'member_invite' then l.payload - 'invite_url' else l.payload end
      where l.id = v_log.id;
      continue;
    end if;

    update public.notification_logs l
    set status = 'sending', attempts = l.attempts + 1, locked_at = now()
    where l.id = v_log.id;
    select * into v_center from public.centers c where c.id = v_log.center_id;
    return query select v_log.id, v_log.center_id, v_log.member_id, v_log.type, v_log.template_code,
      v_log.payload, v_log.attempts + 1, v_member.name, v_member.phone, v_center.name, v_center.timezone,
      v_center.notify_sms_fallback,
      coalesce((
        select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
        from public.push_subscriptions ps
        where ps.member_id = v_log.member_id
      ), '[]'::jsonb);
  end loop;
end;
$$;

revoke all on function public.claim_notifications(int, uuid) from public, anon, authenticated;
grant execute on function public.claim_notifications(int, uuid) to service_role;
