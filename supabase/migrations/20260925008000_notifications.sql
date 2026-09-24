-- ─────────────────────────────────────────────────────────────
-- 알림 발송: 리마인드 예약(스케줄러) · 발송 대기열 가져오기(claim) · 결과 기록(finish) · Cron
-- 실제 발송은 Edge Function(send-notifications)이 한다. 아래 public 함수들은 service_role 전용
-- ─────────────────────────────────────────────────────────────

-- 알림톡 실패 시 SMS 대체발송 (비용이 들어서 기본은 끔. 대표가 설정에서 켠다)
alter table public.centers add column notify_sms_fallback boolean not null default false;
grant update (notify_sms_fallback) on public.centers to authenticated;

-- 발송 중(sending)으로 가져간 시각. 함수가 중간에 멈추면 이 시각으로 다시 시도할지 판단한다
alter table public.notification_logs add column locked_at timestamptz;
-- 실제로 보낸 발송대행사 (mock = 키 연결 전 테스트 발송, solapi …)
alter table public.notification_logs add column provider text;

-- 보내기 직전에 다시 확인: 상황이 바뀌어 더 이상 맞지 않는 알림이면 이유 코드를 돌려준다
create or replace function private.notification_stale_reason(p_log public.notification_logs)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_pass public.member_passes;
  v_token text;
begin
  if p_log.type in ('booking_confirmed', 'waitlist_promoted', 'reminder_day_before', 'reminder_2h') then
    select * into v_booking from public.bookings where id = (p_log.payload ->> 'booking_id')::uuid;
    if v_booking.id is null or v_booking.status <> 'booked' then
      return 'BOOKING_CHANGED';
    end if;
    select * into v_session from public.sessions where id = v_booking.session_id;
    if v_session.status <> 'scheduled' or v_session.deleted_at is not null then
      return 'SESSION_CANCELLED';
    end if;
    -- 시간이 바뀐 수업은 옛 시간을 안내하지 않는다 (변경 알림이 따로 나간다)
    if v_session.starts_at is distinct from (p_log.payload ->> 'starts_at')::timestamptz then
      return 'SESSION_CHANGED';
    end if;
    if v_session.starts_at <= now() then
      return 'SESSION_STARTED';
    end if;
  elsif p_log.type in ('pass_expiring_d7', 'pass_remaining_one') then
    select * into v_pass from public.member_passes where id = (p_log.payload ->> 'member_pass_id')::uuid;
    if v_pass.id is null or v_pass.status <> 'active' or v_pass.deleted_at is not null then
      return 'PASS_CHANGED';
    end if;
    if p_log.type = 'pass_expiring_d7' and v_pass.end_date is distinct from (p_log.payload ->> 'end_date')::date then
      return 'PASS_CHANGED';
    end if;
    if p_log.type = 'pass_remaining_one' and v_pass.remaining_count is distinct from 1 then
      return 'PASS_CHANGED';
    end if;
  elsif p_log.type = 'member_invite' then
    -- 새 초대 링크가 나갔거나 이미 연결·만료된 링크는 보내지 않는다
    v_token := regexp_replace(coalesce(p_log.payload ->> 'invite_url', ''), '^.*/', '');
    if not exists (
      select 1 from public.member_invites i
      where i.token_hash = private.invite_token_hash(v_token)
        and i.used_at is null and i.revoked_at is null and i.expires_at > now()
    ) then
      return 'INVITE_CHANGED';
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.notification_stale_reason(public.notification_logs) from public;

-- 예약 리마인드 · 이용권 만료 D-7 을 때가 되면 대기열에 넣는다 (Cron → Edge Function 이 1분마다 호출)
--   전날 리마인드   수업 전날 20:00 (센터 시간대)
--   2시간 전 리마인드 발송 시각이 21시~08시에 걸리면 보내지 않는다 (새벽 수업은 전날 리마인드로 대체)
--   만료 D-7        만료 7일 전 10:00~21:00 사이 (다음 이용권을 이미 받은 회원은 제외)
-- 발송 시각에서 1시간이 지나도록 못 넣었으면(장애 등) 늦은 안내가 되므로 건너뛴다.
-- p_now · p_center_id 는 테스트용 (평소에는 지금 · 전체 센터)
create or replace function public.enqueue_scheduled_notifications(
  p_now timestamptz default now(),
  p_center_id uuid default null
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count int := 0;
begin
  for v_row in
    select b.id as booking_id, b.member_id, s.id as session_id, s.center_id, r.kind, r.dedupe_key
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    join public.centers c on c.id = s.center_id
    cross join lateral (
      values
        ('reminder_day_before',
         ((((s.starts_at at time zone c.timezone)::date - 1) + time '20:00') at time zone c.timezone)),
        ('reminder_2h', s.starts_at - interval '2 hours')
    ) as t(kind, send_at)
    cross join lateral (
      select t.kind, t.send_at,
             t.kind || ':' || b.id || ':' || extract(epoch from s.starts_at)::bigint as dedupe_key
    ) as r
    where b.status = 'booked'
      and s.status = 'scheduled'
      and s.deleted_at is null
      and (p_center_id is null or s.center_id = p_center_id)
      and s.starts_at > p_now
      and s.starts_at <= p_now + interval '2 days'
      and p_now >= r.send_at
      and p_now < r.send_at + interval '1 hour'
      -- 발송 시각이 지난 뒤에 한 예약은 방금 확인했으므로 안내하지 않는다
      and b.created_at < r.send_at
      and (r.kind <> 'reminder_2h' or extract(hour from r.send_at at time zone c.timezone) between 8 and 20)
      and not exists (select 1 from public.notification_logs l where l.dedupe_key = r.dedupe_key)
  loop
    perform private.enqueue_notification(
      v_row.center_id, v_row.member_id, v_row.kind,
      private.session_payload(v_row.session_id) || jsonb_build_object('booking_id', v_row.booking_id),
      v_row.dedupe_key
    );
    v_count := v_count + 1;
  end loop;

  for v_row in
    select mp.id, mp.center_id, mp.member_id, mp.name, mp.end_date, c.name as center_name,
           'pass_expiring_d7:' || mp.id || ':' || mp.end_date as dedupe_key
    from public.member_passes mp
    join public.members m on m.id = mp.member_id
    join public.centers c on c.id = mp.center_id
    where mp.status = 'active'
      and mp.deleted_at is null
      and m.status = 'active'
      and m.deleted_at is null
      and (p_center_id is null or mp.center_id = p_center_id)
      and mp.end_date = (p_now at time zone c.timezone)::date + 7
      and extract(hour from p_now at time zone c.timezone) between 10 and 20
      and (mp.remaining_count is null or mp.remaining_count > 0)
      and not exists (
        select 1 from public.member_passes other
        where other.member_id = mp.member_id
          and other.id <> mp.id
          and other.status = 'active'
          and other.deleted_at is null
          and (other.end_date is null or other.end_date > mp.end_date)
          and (other.remaining_count is null or other.remaining_count > 0)
      )
      and not exists (
        select 1 from public.notification_logs l
        where l.dedupe_key = 'pass_expiring_d7:' || mp.id || ':' || mp.end_date
      )
  loop
    perform private.enqueue_notification(
      v_row.center_id, v_row.member_id, 'pass_expiring_d7',
      jsonb_build_object(
        'member_pass_id', v_row.id,
        'pass_name', v_row.name,
        'end_date', v_row.end_date,
        'days_left', 7,
        'center_name', v_row.center_name
      ),
      v_row.dedupe_key
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- 보낼 차례가 된 알림을 가져간다 (status: pending → sending). 동시에 여러 번 불려도 겹치지 않는다
create or replace function public.claim_notifications(p_limit int default 50, p_center_id uuid default null)
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
  sms_fallback boolean
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
      v_center.notify_sms_fallback;
  end loop;
end;
$$;

-- 발송 결과를 기록한다. 실패해도 다시 시도할 수 있으면(3번까지) 5분·10분 뒤로 미룬다.
-- 초대 링크(토큰)는 발송이 끝나면 기록에서 지운다
create or replace function public.finish_notification(
  p_id uuid,
  p_ok boolean,
  p_error text default null,
  p_fallback_used boolean default false,
  p_retry boolean default true,
  p_provider text default null
)
returns public.notification_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_log public.notification_logs;
  v_status public.notification_status;
begin
  select * into v_log from public.notification_logs where id = p_id for update;
  if v_log.id is null or v_log.status <> 'sending' then
    perform private.raise_app_error('INVALID_STATUS');
  end if;
  v_status := case
    when p_ok then 'sent'::public.notification_status
    when p_retry and v_log.attempts < 3 then 'pending'
    else 'failed'
  end;

  update public.notification_logs l
  set status = v_status,
      sent_at = case when p_ok then now() end,
      error = case when p_ok then null else left(coalesce(p_error, 'UNKNOWN'), 500) end,
      fallback_used = p_fallback_used,
      provider = coalesce(p_provider, l.provider),
      locked_at = null,
      scheduled_at = case
        when v_status = 'pending' then now() + make_interval(mins => 5 * v_log.attempts)
        else l.scheduled_at
      end,
      payload = case
        when l.type = 'member_invite' and v_status <> 'pending' then l.payload - 'invite_url'
        else l.payload
      end
  where l.id = p_id;
  return v_status;
end;
$$;

revoke all on function public.enqueue_scheduled_notifications(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_scheduled_notifications(timestamptz, uuid) to service_role;
revoke all on function public.claim_notifications(int, uuid) from public, anon, authenticated;
grant execute on function public.claim_notifications(int, uuid) to service_role;
revoke all on function public.finish_notification(uuid, boolean, text, boolean, boolean, text)
  from public, anon, authenticated;
grant execute on function public.finish_notification(uuid, boolean, text, boolean, boolean, text) to service_role;

-- Cron: 1분마다 Edge Function(send-notifications)을 부른다.
-- 주소와 비밀값은 Vault 에 넣어 둔다 (README "알림 설정"). 넣기 전에는 아무것도 하지 않는다
create or replace function private.invoke_notification_sender()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'gymjjim_functions_url';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'gymjjim_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/send-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function private.invoke_notification_sender() from public;

-- pg_cron · pg_net 이 있는 환경(Supabase)에서만 등록한다. 테스트용 PostgreSQL 에는 없어서 건너뛴다
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('gymjjim-send-notifications', '* * * * *', 'select private.invoke_notification_sender()');
  end if;
end;
$$;
