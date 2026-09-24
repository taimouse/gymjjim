/**
 * 발송 루프: claim_notifications 로 가져온 알림을 템플릿으로 채워 채널로 보내고 결과를 돌려준다.
 * Supabase Edge Function(send-notifications)이 쓰고, 여기서는 DB·네트워크를 직접 부르지 않아 테스트하기 쉽다.
 * (Deno 에서는 zod 를 함수의 deno.json import map 이 npm:zod 로 연결한다)
 */
import { z } from 'zod';

import type { AlimtalkChannel } from './channels.ts';
import { renderNotification } from './templates.ts';

const claimedNotification = z.object({
  id: z.uuid(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  member_name: z.string().nullable(),
  phone: z.string().regex(/^\d{9,11}$/),
  center_name: z.string().nullable(),
  center_timezone: z.string().nullable(),
  sms_fallback: z.boolean(),
});
export type ClaimedNotification = z.infer<typeof claimedNotification>;

/** RPC 결과 검증. 형식이 다른 행은 버리고(10분 뒤 다시 시도됨) 이유를 남긴다 */
export function parseClaimed(data: unknown): { rows: ClaimedNotification[]; invalid: number } {
  const list = Array.isArray(data) ? data : [];
  const rows: ClaimedNotification[] = [];
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

/** 한 건 보내기: 템플릿이 없으면 다시 시도하지 않는 실패 */
export async function deliver(row: ClaimedNotification, channel: AlimtalkChannel): Promise<DeliveryOutcome> {
  const rendered = renderNotification(row.type, row.payload, {
    memberName: row.member_name,
    centerName: row.center_name,
    timezone: row.center_timezone,
  });
  if (!rendered) {
    return {
      id: row.id,
      ok: false,
      error: `UNKNOWN_TEMPLATE ${row.type}`,
      retry: false,
      provider: channel.provider,
    };
  }
  const result = await channel.send({
    to: row.phone,
    code: rendered.code,
    variables: rendered.variables,
    text: rendered.text,
    smsFallback: row.sms_fallback,
  });
  return {
    id: row.id,
    ok: result.ok,
    error: result.ok ? null : (result.error ?? 'UNKNOWN'),
    retry: result.retryable,
    provider: channel.provider,
  };
}

/** 여러 건을 몇 개씩 나눠 보내고, 한 건 끝날 때마다 finish 로 기록한다 */
export async function deliverAll(
  rows: ClaimedNotification[],
  channel: AlimtalkChannel,
  finish: (outcome: DeliveryOutcome) => Promise<void>,
  concurrency = 5,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < rows.length; index += concurrency) {
    await Promise.all(
      rows.slice(index, index + concurrency).map(async (row) => {
        const outcome = await deliver(row, channel).catch((error: unknown): DeliveryOutcome => ({
          id: row.id,
          ok: false,
          error: `EXCEPTION ${error instanceof Error ? error.message : String(error)}`,
          retry: true,
          provider: channel.provider,
        }));
        await finish(outcome);
        if (outcome.ok) sent += 1;
        else failed += 1;
      }),
    );
  }
  return { sent, failed };
}
