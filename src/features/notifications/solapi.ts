/**
 * Solapi(솔라피) 카카오 알림톡 발송 어댑터.
 * - POST https://api.solapi.com/messages/v4/send-many/detail
 * - 인증: `HMAC-SHA256 apiKey=…, date=…, salt=…, signature=hex(HMAC_SHA256(apiSecret, date + salt))`
 * - 변수 방식(kakaoOptions.variables)으로만 보낸다. 이때 text 는 함께 보낼 수 없다
 * - disableSms=false 면 알림톡 실패 시 등록된 발신번호로 문자 대체발송
 *
 * Edge Function(Deno)과 테스트(Node)가 함께 쓰므로 웹 표준 API(fetch · crypto.subtle)만 쓰고 import 하지 않는다.
 * 응답은 외부 입력이라 필드를 하나씩 확인한다.
 */

export const SOLAPI_SEND_URL = 'https://api.solapi.com/messages/v4/send-many/detail';

export interface SolapiConfig {
  apiKey: string;
  apiSecret: string;
  /** 사전 등록한 발신번호 (문자 대체발송에 필요) */
  senderNumber: string;
  /** 카카오 채널 연동 ID */
  pfId: string;
  /** 우리 템플릿 코드(BOOKING_CONFIRMED …) → 검수 받은 Solapi 템플릿 ID */
  templateIds: Record<string, string>;
}

export interface AlimtalkMessage {
  /** 수신 번호 (숫자만) */
  to: string;
  code: string;
  variables: Record<string, string>;
  smsFallback: boolean;
}

export interface SendResult {
  ok: boolean;
  /** 잠시 뒤 다시 보내면 될 수 있는 실패인지 (네트워크 · 429 · 5xx) */
  retryable: boolean;
  error?: string;
}

/** 환경 변수 → 설정. 필수 값이 비어 있거나 템플릿 ID 형식(JSON 객체)이 틀리면 null */
export function parseSolapiConfig(env: Record<string, string | undefined>): SolapiConfig | null {
  const apiKey = env.SOLAPI_API_KEY?.trim();
  const apiSecret = env.SOLAPI_API_SECRET?.trim();
  const senderNumber = env.SOLAPI_SENDER_NUMBER?.replace(/\D/g, '');
  const pfId = env.SOLAPI_KAKAO_PFID?.trim();
  if (!apiKey || !apiSecret || !senderNumber || !pfId || !env.SOLAPI_TEMPLATE_IDS) return null;
  try {
    const parsed: unknown = JSON.parse(env.SOLAPI_TEMPLATE_IDS);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const templateIds: Record<string, string> = {};
    for (const [code, id] of Object.entries(parsed)) {
      if (typeof id !== 'string') return null;
      // 아직 검수 전인 템플릿(빈 값)은 등록하지 않는다 → 그 알림만 TEMPLATE_NOT_REGISTERED 로 남는다
      if (id.trim()) templateIds[code] = id.trim();
    }
    return { apiKey, apiSecret, senderNumber, pfId, templateIds };
  } catch {
    return null;
  }
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Authorization 헤더 값 */
export async function solapiAuthorization(
  apiKey: string,
  apiSecret: string,
  date: string = new Date().toISOString(),
  salt: string = crypto.randomUUID().replace(/-/g, ''),
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(date + salt));
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${toHex(signature)}`;
}

export function buildSolapiBody(config: SolapiConfig, message: AlimtalkMessage, templateId: string) {
  return {
    messages: [
      {
        to: message.to,
        from: config.senderNumber,
        kakaoOptions: {
          pfId: config.pfId,
          templateId,
          variables: message.variables,
          disableSms: !message.smsFallback,
        },
      },
    ],
  };
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

/** HTTP 상태 + 응답 본문 → 결과. 접수되면 성공(실제 도달 결과는 Solapi 콘솔·웹훅에서 확인) */
export function parseSolapiResponse(status: number, body: unknown): SendResult {
  if (status === 429 || status >= 500) {
    return { ok: false, retryable: true, error: `HTTP_${status}` };
  }
  if (status < 200 || status >= 300) {
    const code = field(body, 'errorCode');
    const message = field(body, 'errorMessage');
    return {
      ok: false,
      retryable: false,
      error: [`HTTP_${status}`, code, message]
        .filter((part) => typeof part === 'string' || typeof part === 'number')
        .join(' '),
    };
  }
  const failed = field(body, 'failedMessageList');
  if (Array.isArray(failed) && failed.length > 0) {
    const first: unknown = failed[0];
    return {
      ok: false,
      retryable: false,
      error:
        [field(first, 'statusCode'), field(first, 'statusMessage')]
          .filter((part) => typeof part === 'string' || typeof part === 'number')
          .join(' ') || 'SOLAPI_FAILED',
    };
  }
  return { ok: true, retryable: false };
}

export async function sendSolapiAlimtalk(
  config: SolapiConfig,
  message: AlimtalkMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<SendResult> {
  const templateId = config.templateIds[message.code];
  if (!templateId) return { ok: false, retryable: false, error: `TEMPLATE_NOT_REGISTERED ${message.code}` };
  try {
    const response = await fetchImpl(SOLAPI_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: await solapiAuthorization(config.apiKey, config.apiSecret),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildSolapiBody(config, message, templateId)),
    });
    const body: unknown = await response.json().catch(() => null);
    return parseSolapiResponse(response.status, body);
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      error: `NETWORK ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
