/**
 * 앱 에러 코드. DB(RPC·트리거)는 `raise exception using message = '<CODE>'` 로 코드를 던지고,
 * 화면은 `errors.<CODE>` 메시지 키(messages/ko.json)로 바꿔서 보여준다.
 */
export const APP_ERROR_CODES = [
  // 인증·권한
  'NOT_AUTHENTICATED',
  'FORBIDDEN',
  'INVALID_CREDENTIALS',
  'RATE_LIMITED',
  'KAKAO_UNAVAILABLE',
  'AUTH_LINK_INVALID',
  'WEAK_PASSWORD',
  // 세션·예약
  'SESSION_NOT_FOUND',
  'SESSION_CANCELLED',
  'SESSION_STARTED',
  'SESSION_ENDED',
  'SESSION_FULL',
  'BOOKING_NOT_OPEN',
  'BOOKING_CLOSED',
  'ALREADY_BOOKED',
  'DUPLICATE_TIME',
  'BOOKING_NOT_FOUND',
  'BOOKING_NOT_CANCELLABLE',
  'INVALID_STATUS',
  // 이용권
  'NO_VALID_PASS',
  'PASS_NOT_FOUND',
  'PASS_NOT_ALLOWED',
  'PASS_NOT_STARTED',
  'PASS_EXPIRED',
  'PASS_ON_HOLD',
  'PASS_EXHAUSTED',
  'PASS_INSUFFICIENT',
  'PERIOD_LIMIT_REACHED',
  'INVALID_DATE_RANGE',
  'HOLD_OUT_OF_RANGE',
  'HOLD_OVERLAP',
  'HOLD_HAS_BOOKINGS',
  // 회원·센터
  'MEMBER_NOT_FOUND',
  'MEMBER_PHONE_EXISTS',
  'PRODUCT_NOT_FOUND',
  'MEMBER_ALREADY_LINKED',
  'ALREADY_MEMBER',
  'INVITE_INVALID',
  'INVITE_USED',
  'INVITE_EXPIRED',
  'LAST_OWNER',
  'STAFF_EMAIL_EXISTS',
  'INVITE_FAILED',
  'INVALID_TIMEZONE',
  // 요금제·운영자
  'PLAN_MEMBER_LIMIT',
  'PLAN_STAFF_LIMIT',
  'PLAN_NOT_FOUND',
  'PLAN_CODE_EXISTS',
  'CENTER_NOT_FOUND',
  'INVOICE_NOT_FOUND',
  'INVOICE_EXISTS',
  // 클라이언트 측
  'VALIDATION',
  'NETWORK',
  'UNKNOWN',
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(APP_ERROR_CODES);

export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return typeof value === 'string' && CODE_SET.has(value);
}

interface ErrorLike {
  message?: unknown;
  code?: unknown;
}

/** Supabase(PostgREST) 에러·예외를 앱 에러 코드로 바꾼다. 모르는 에러는 UNKNOWN */
export function toAppErrorCode(error: unknown): AppErrorCode {
  if (!error || typeof error !== 'object') return 'UNKNOWN';
  const { message, code } = error as ErrorLike;
  if (isAppErrorCode(message)) return message;
  // PostgREST: 권한 없음(42501), JWT 만료(PGRST301)
  if (code === '42501') return 'FORBIDDEN';
  if (code === 'PGRST301' || code === 'PGRST303') return 'NOT_AUTHENTICATED';
  if (typeof message === 'string' && /fetch failed|Failed to fetch|NetworkError/i.test(message)) {
    return 'NETWORK';
  }
  return 'UNKNOWN';
}

/** next-intl 메시지 키 */
export function errorMessageKey(code: AppErrorCode): `errors.${AppErrorCode}` {
  return `errors.${code}`;
}
