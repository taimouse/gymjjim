/**
 * 발송 루프: claim_notifications 로 가져온 알림을 템플릿으로 채워 알림톡으로 보내고(주),
 * 회원이 켠 기기에는 웹 푸시로도 보낸다(보조). 결과는 건마다 finish 로 넘긴다.
 * Supabase Edge Function(send-notifications)이 쓰고, 여기서는 DB·네트워크를 직접 부르지 않아 테스트하기 쉽다.
 * (Deno 에서는 zod 를 함수의 deno.json import map 이 npm:zod 로 연결한다)
 */
import { z } from 'zod';

import type { AlimtalkChannel, PushChannel } from './channels.ts';
import { renderNotification } from './templates.ts';
import { toPushPayload } from './webpush.ts';

const claimedNotification = z.object({
  id: z.uuid(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  attempts: z.number().int().min(1),
  member_name: z.string().nullable(),
  phone: z.string().regex(/^\d{9,11}$/),
  center_name: z.string().nullable(),
  center_timezone: z.string().nullable(),
  sms_fallback: z.boolean(),
  push_subscriptions: z
    .array(z.object({ endpoint: z.url(), p256dh: z.string().min(1), auth: z.string().min(1) }))
    .default([]),
});
export type ClaimedNotification = z.input<typeof claimedNotification>;
type Claimed = z.output<typeof claimedNotification>;

/** RPC 결과 검증. 형식이 다른 행은 버리고(10분 뒤 다시 시도됨) 개수를 돌려준다 */
export function parseClaimed(data: unknown): { rows: Claimed[]; invalid: number } {
  const list = Array.isArray(data) ? data : [];
  const rows: Claimed[] = [];
  for (const item of list) {
    const parsed = claimedNotification.safeParse(item);
    if (parsed.success) rows.push(parsed.data);
  }
  return { rows, invalid: list.length - rows.length };
}

export interface DeliveryOutcome {
  id: string;
  ok: boolean;
  error: string | null;
  retry: boolean;
  provider: string;
}

export interface Channels {
  alimtalk: AlimtalkChannel;
  push?: PushChannel | null;
}

interface Delivered {
  outcome: DeliveryOutcome;
  pushed: number;
  expired: string[];
}

/** 한 건 보내기: 템플릿이 없으면 다시 시도하지 않는 실패. 푸시는 첫 시도에만 (재시도 때 중복 방지) */
export async function deliver(row: Claimed, channels: Channels): Promise<Delivered> {
  const { alimtalk, push } = channels;
  const rendered = renderNotification(row.type, row.payload, {
    memberName: row.member_name,
    centerName: row.center_name,
    timezone: row.center_timezone,
  });
  if (!rendered) {
    return {
      outcome: {
        id: row.id,
        ok: false,
        error: `UNKNOWN_TEMPLATE ${row.type}`,
        retry: false,
        provider: alimtalk.provider,
      },
      pushed: 0,
      expired: [],
    };
  }

  const result = await alimtalk.send({
    to: row.phone,
    code: rendered.code,
    variables: rendered.variables,
    text: rendered.text,
    smsFallback: row.sms_fallback,
  });
  const pushResult =
    push && row.attempts === 1 && row.push_subscriptions.length > 0
      ? await push
          .send(row.push_subscriptions, toPushPayload(row.type, rendered.text, `${row.type}:${row.id}`))
          .catch(() => null)
      : null;

  return {
    outcome: {
      id: row.id,
      ok: result.ok,
      error: result.ok ? null : (result.error ?? 'UNKNOWN'),
      retry: result.retryable,
      provider: alimtalk.provider,
    },
    pushed: pushResult?.sent ?? 0,
    expired: pushResult?.expired ?? [],
  };
}

/** 여러 건을 몇 개씩 나눠 보내고, 한 건 끝날 때마다 finish 로 기록한다 */
export async function deliverAll(
  rows: Claimed[],
  channels: Channels,
  finish: (outcome: DeliveryOutcome) => Promise<void>,
  concurrency = 5,
): Promise<{ sent: number; failed: number; pushed: number; expired: string[] }> {
  const summary = { sent: 0, failed: 0, pushed: 0, expired: [] as string[] };
  for (let index = 0; index < rows.length; index += concurrency) {
    await Promise.all(
      rows.slice(index, index + concurrency).map(async (row) => {
        const delivered = await deliver(row, channels).catch((error: unknown): Delivered => ({
          outcome: {
            id: row.id,
            ok: false,
            error: `EXCEPTION ${error instanceof Error ? error.message : String(error)}`,
            retry: true,
            provider: channels.alimtalk.provider,
          },
          pushed: 0,
          expired: [],
        }));
        await finish(delivered.outcome);
        if (delivered.outcome.ok) summary.sent += 1;
        else summary.failed += 1;
        summary.pushed += delivered.pushed;
        summary.expired.push(...delivered.expired);
      }),
    );
  }
  return summary;
}
