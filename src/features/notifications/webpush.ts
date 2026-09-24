/**
 * 웹 푸시 발송 (VAPID) — 알림톡의 보조 채널. 회원이 앱(PWA)에서 켠 기기로 같은 안내를 보낸다.
 * Edge Function(Deno)과 테스트가 함께 쓴다. Deno 에서는 함수의 deno.json 이 web-push 를 npm:web-push 로 연결한다.
 */
import webpush from 'web-push';

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** 알림을 누르면 열 앱 경로 */
  url: string;
  /** 같은 알림이 겹쳐 쌓이지 않게 하는 태그 */
  tag: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  /** 404·410: 사용자가 권한을 거두었거나 만료된 구독 → 지운다 */
  expired: string[];
}

export type SendNotification = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions,
) => Promise<unknown>;

/** VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT(mailto: 또는 https:) 가 모두 있어야 보낸다 */
export function parsePushConfig(env: Record<string, string | undefined>): PushConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

const PUSH_PATHS: Record<string, string> = {
  pass_expiring_d7: '/m/me',
  pass_remaining_one: '/m/me',
};

/** 알림톡 문구 → 푸시 제목(첫 줄)·본문(나머지) */
export function toPushPayload(type: string, text: string, tag: string): PushPayload {
  const [first = '', ...rest] = text.split('\n');
  const title = first.trim();
  const body = rest
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return { title, body: body || title, url: PUSH_PATHS[type] ?? '/m/my-bookings', tag };
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return null;
  return typeof error.statusCode === 'number' ? error.statusCode : null;
}

/** 한 회원의 기기들로 보낸다 */
export async function sendWebPush(
  config: PushConfig,
  subscriptions: PushSubscriptionKeys[],
  payload: PushPayload,
  send: SendNotification = webpush.sendNotification,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, expired: [] };
  for (const subscription of subscriptions) {
    try {
      await send(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: {
            subject: config.subject,
            publicKey: config.publicKey,
            privateKey: config.privateKey,
          },
          TTL: 60 * 60 * 12,
          urgency: 'normal',
        },
      );
      result.sent += 1;
    } catch (error) {
      const status = statusCode(error);
      if (status === 404 || status === 410) result.expired.push(subscription.endpoint);
      else result.failed += 1;
    }
  }
  return result;
}
