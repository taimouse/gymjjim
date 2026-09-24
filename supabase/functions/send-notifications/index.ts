// 알림 발송 Edge Function — Supabase Cron(pg_cron + pg_net)이 1분마다 부른다.
//   1) 때가 된 리마인드 · 만료 D-7 을 대기열에 넣고   (enqueue_scheduled_notifications)
//   2) 보낼 차례인 알림을 가져와                      (claim_notifications)
//   3) 템플릿으로 변수를 채워 알림톡으로 보내고,        (src/features/notifications)
//      회원이 켠 기기에는 웹 푸시로도 보낸 뒤
//   4) 결과를 기록하고 만료된 푸시 구독을 지운다         (finish_notification · remove_push_subscriptions)
// config.toml 에서 verify_jwt = false 이므로 x-cron-secret 헤더로 호출자를 확인한다.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from '@supabase/supabase-js';

import { createAlimtalkChannel, createPushChannel } from '../../../src/features/notifications/channels.ts';
import { deliverAll, parseClaimed } from '../../../src/features/notifications/dispatch.ts';

const BATCH_SIZE = 50;

/** 새 API 키(SUPABASE_SECRET_KEYS.default)를 먼저 쓰고, 없으면 예전 service_role 키 */
function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed: unknown = JSON.parse(keys);
      const value = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).default : null;
      if (typeof value === 'string' && value) return value;
    } catch {
      // 형식이 다르면 예전 키로 넘어간다
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

/** 비밀값 비교 (길이·내용에 따라 걸리는 시간이 달라지지 않게) */
function sameSecret(received: string, expected: string): boolean {
  const a = new TextEncoder().encode(received);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let index = 0; index < b.length; index += 1) diff |= (a[index] ?? 0) ^ b[index]!;
  return diff === 0;
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  const expected = Deno.env.get('NOTIFY_CRON_SECRET');
  if (!expected || !sameSecret(request.headers.get('x-cron-secret') ?? '', expected)) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const env = Deno.env.toObject();
  const alimtalk = createAlimtalkChannel(env);
  if (!alimtalk) return Response.json({ error: 'PROVIDER_NOT_CONFIGURED' }, { status: 500 });
  const push = createPushChannel(env);

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const scheduled = await supabase.rpc('enqueue_scheduled_notifications');
  if (scheduled.error) console.error('enqueue_scheduled_notifications', scheduled.error.message);

  const claimed = await supabase.rpc('claim_notifications', { p_limit: BATCH_SIZE });
  if (claimed.error) return Response.json({ error: claimed.error.message }, { status: 500 });
  const { rows, invalid } = parseClaimed(claimed.data);
  if (invalid > 0)
    console.error(`claim_notifications: 형식이 맞지 않는 ${invalid}건은 10분 뒤 다시 시도합니다`);

  const result = await deliverAll(rows, { alimtalk, push }, async (outcome) => {
    const { error } = await supabase.rpc('finish_notification', {
      p_id: outcome.id,
      p_ok: outcome.ok,
      p_error: outcome.error,
      p_retry: outcome.retry,
      p_provider: outcome.provider,
    });
    if (error) console.error('finish_notification', outcome.id, error.message);
  });

  if (result.expired.length > 0) {
    const { error } = await supabase.rpc('remove_push_subscriptions', { p_endpoints: result.expired });
    if (error) console.error('remove_push_subscriptions', error.message);
  }

  return Response.json({
    provider: alimtalk.provider,
    push: push !== null,
    enqueued: typeof scheduled.data === 'number' ? scheduled.data : 0,
    claimed: rows.length,
    sent: result.sent,
    failed: result.failed,
    pushed: result.pushed,
    expiredPush: result.expired.length,
  });
});
