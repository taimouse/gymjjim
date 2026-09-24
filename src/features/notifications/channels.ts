/**
 * 알림톡 발송 채널(어댑터). 발송대행사를 바꿀 때는 여기에 어댑터 하나만 추가하면 된다.
 * NOTIFY_ALIMTALK_PROVIDER: mock(기본, 보내지 않고 기록만) | solapi
 *
 * Supabase Edge Function(Deno)이 쓰는 모듈이라 import 경로에 .ts 확장자를 붙인다.
 */
import { type AlimtalkMessage, parseSolapiConfig, sendSolapiAlimtalk, type SendResult } from './solapi.ts';
import {
  parsePushConfig,
  type PushPayload,
  type PushResult,
  type PushSubscriptionKeys,
  type SendNotification,
  sendWebPush,
} from './webpush.ts';

export interface OutgoingAlimtalk extends AlimtalkMessage {
  /** 변수를 채운 문구 (mock 기록 · 웹 푸시 본문) */
  text: string;
}

export interface AlimtalkChannel {
  readonly provider: string;
  send(message: OutgoingAlimtalk): Promise<SendResult>;
}

function maskPhone(phone: string): string {
  return phone.length >= 8 ? `${phone.slice(0, 3)}-****-${phone.slice(-4)}` : '****';
}

/** 실제 키를 연결하기 전: 보내지 않고 함수 로그에만 남긴다 (발송 기록에는 provider=mock 으로 남는다) */
export function mockChannel(log: (line: string) => void = console.log): AlimtalkChannel {
  return {
    provider: 'mock',
    send(message) {
      log(`[mock 알림톡] ${maskPhone(message.to)} ${message.code}\n${message.text}`);
      return Promise.resolve({ ok: true, retryable: false });
    },
  };
}

/** 환경 변수로 채널을 고른다. 설정이 빠졌으면 null (보내지 않는다) */
export function createAlimtalkChannel(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
): AlimtalkChannel | null {
  const provider = env.NOTIFY_ALIMTALK_PROVIDER?.trim() || 'mock';
  if (provider === 'mock') return mockChannel();
  if (provider === 'solapi') {
    const config = parseSolapiConfig(env);
    return config ? { provider, send: (message) => sendSolapiAlimtalk(config, message, fetchImpl) } : null;
  }
  return null;
}

/** 웹 푸시 채널 (보조). VAPID 키가 없으면 null → 푸시는 보내지 않는다 */
export interface PushChannel {
  send(subscriptions: PushSubscriptionKeys[], payload: PushPayload): Promise<PushResult>;
}

export function createPushChannel(
  env: Record<string, string | undefined>,
  send?: SendNotification,
): PushChannel | null {
  const config = parsePushConfig(env);
  return config
    ? { send: (subscriptions, payload) => sendWebPush(config, subscriptions, payload, send) }
    : null;
}
