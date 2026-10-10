/**
 * 카카오 알림톡 템플릿 (정보성 메시지만 · 광고성 문구 금지 · 자유 문구 발송 없음)
 * - code: notification_logs.template_code 와 같은 값. 발송대행사(Solapi)에 검수 받은 템플릿 ID 와 짝을 짓는다
 * - body: 카카오에 검수 신청할 원문. `#{변수}` 자리에 값이 들어가며, 원문이 한 글자라도 다르면 발송이 거절된다
 *
 * 이 파일은 Next 앱(설정 > 알림 미리보기)과 Supabase Edge Function(Deno)이 함께 쓴다.
 * 그래서 다른 모듈을 import 하지 않고, 날짜는 Intl 로 직접 포맷한다.
 */

export const NOTIFICATION_TYPES = [
  'booking_confirmed',
  'waitlist_promoted',
  'session_changed',
  'session_cancelled',
  'reminder_day_before',
  'reminder_2h',
  'pass_expiring_d7',
  'pass_remaining_one',
  'member_invite',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

type Payload = Readonly<Record<string, unknown>>;

export interface TemplateContext {
  memberName: string | null;
  centerName: string | null;
  /** 센터 시간대 (payload 에 없을 때 사용) */
  timezone?: string | null;
}

interface TemplateDefinition {
  code: string;
  body: string;
  /** `#{변수}` → 값 */
  variables: (payload: Payload, context: TemplateContext) => Record<string, string>;
  /** 설정 화면 미리보기용 예시 값 */
  sample: Payload;
}

export interface RenderedNotification {
  type: NotificationType;
  code: string;
  variables: Record<string, string>;
  /** 변수를 채운 문구 (미리보기 · 웹 푸시 · mock 기록용) */
  text: string;
}

const DEFAULT_TIME_ZONE = 'Asia/Seoul';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function str(value: unknown, fallback = '-'): string {
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/** `9월 24일 (목) 오후 7:00` (CLAUDE.md 표기) */
export function formatKoreanDateTime(value: unknown, timeZone: string = DEFAULT_TIME_ZONE): string {
  const date = typeof value === 'string' || value instanceof Date ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '-';
  // 오전/오후는 ICU 의 dayPeriod 대신 24시간제 시각으로 정한다 (런타임 ICU 에 따라 "PM" 이 나오는 경우가 있다)
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const hour24 = Number(part('hour')) % 24;
  const month = Number(part('month'));
  const day = Number(part('day'));
  const year = Number(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(date));
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const meridiem = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${month}월 ${day}일 (${weekday}) ${meridiem} ${hour12}:${part('minute')}`;
}

/** 날짜 키 `2026-09-24` → `9월 24일 (목)` (시간대 변환 없음) */
export function formatKoreanDateKey(value: unknown): string {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (!match) return '-';
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

const timeZoneOf = (payload: Payload, context: TemplateContext) =>
  str(payload.timezone, '') || context.timezone || DEFAULT_TIME_ZONE;
const centerOf = (payload: Payload, context: TemplateContext) =>
  str(payload.center_name, '') || str(context.centerName);
const memberOf = (payload: Payload, context: TemplateContext) =>
  str(context.memberName, '') || str(payload.member_name, '회원');

function sessionVariables(payload: Payload, context: TemplateContext): Record<string, string> {
  return {
    '#{센터명}': centerOf(payload, context),
    '#{회원명}': memberOf(payload, context),
    '#{수업명}': str(payload.program_name),
    '#{수업일시}': formatKoreanDateTime(payload.starts_at, timeZoneOf(payload, context)),
    '#{강사명}': str(payload.instructor_name, '미정'),
  };
}

const SESSION_SAMPLE: Payload = {
  program_name: '저녁 WOD',
  starts_at: '2026-09-24T10:00:00Z',
  ends_at: '2026-09-24T10:50:00Z',
  timezone: DEFAULT_TIME_ZONE,
  center_name: '재키 피트니스 구미점',
  instructor_name: '이코치',
};

export const NOTIFICATION_TEMPLATES: Record<NotificationType, TemplateDefinition> = {
  booking_confirmed: {
    code: 'BOOKING_CONFIRMED',
    body: '[#{센터명}] #{회원명}님, 수업 예약이 확정되었습니다.\n\n■ 수업: #{수업명}\n■ 일시: #{수업일시}\n■ 강사: #{강사명}\n\n예약 변경·취소는 회원 앱에서 할 수 있습니다.',
    variables: sessionVariables,
    sample: SESSION_SAMPLE,
  },
  waitlist_promoted: {
    code: 'WAITLIST_PROMOTED',
    body: '[#{센터명}] #{회원명}님, 대기 신청하신 수업의 자리가 나서 예약이 확정되었습니다.\n\n■ 수업: #{수업명}\n■ 일시: #{수업일시}\n■ 강사: #{강사명}\n\n참석이 어려우시면 회원 앱에서 예약을 취소해 주세요.',
    variables: sessionVariables,
    sample: SESSION_SAMPLE,
  },
  session_changed: {
    code: 'SESSION_CHANGED',
    body: '[#{센터명}] #{회원명}님, 예약하신 수업의 시간이 변경되었습니다.\n\n■ 수업: #{수업명}\n■ 변경 전: #{변경전일시}\n■ 변경 후: #{수업일시}\n\n변경된 시간에 참석이 어려우시면 회원 앱에서 예약을 취소해 주세요.',
    variables: (payload, context) => ({
      ...sessionVariables(payload, context),
      '#{변경전일시}': formatKoreanDateTime(payload.previous_starts_at, timeZoneOf(payload, context)),
    }),
    sample: { ...SESSION_SAMPLE, previous_starts_at: '2026-09-24T09:00:00Z' },
  },
  session_cancelled: {
    code: 'SESSION_CANCELLED',
    body: '[#{센터명}] #{회원명}님, 예약하신 수업이 폐강되었습니다.\n\n■ 수업: #{수업명}\n■ 일시: #{수업일시}\n■ 사유: #{폐강사유}\n\n이 수업으로 차감된 이용권 횟수는 복구되었습니다.',
    variables: (payload, context) => ({
      ...sessionVariables(payload, context),
      '#{폐강사유}': str(payload.reason, '센터 사정'),
    }),
    sample: { ...SESSION_SAMPLE, reason: '강사 개인 사정' },
  },
  reminder_day_before: {
    code: 'REMINDER_DAY_BEFORE',
    body: '[#{센터명}] #{회원명}님, 내일 예약하신 수업을 안내해 드립니다.\n\n■ 수업: #{수업명}\n■ 일시: #{수업일시}\n■ 강사: #{강사명}\n\n참석이 어려우시면 회원 앱에서 미리 취소해 주세요.',
    variables: sessionVariables,
    sample: SESSION_SAMPLE,
  },
  reminder_2h: {
    code: 'REMINDER_2H',
    body: '[#{센터명}] #{회원명}님, 예약하신 수업이 2시간 뒤에 시작합니다.\n\n■ 수업: #{수업명}\n■ 일시: #{수업일시}\n■ 강사: #{강사명}',
    variables: sessionVariables,
    sample: SESSION_SAMPLE,
  },
  pass_expiring_d7: {
    code: 'PASS_EXPIRING_D7',
    body: '[#{센터명}] 이용권 만료 예정 안내\n\n#{회원명}님, 이용 중인 이용권이 7일 뒤 만료됩니다.\n\n■ 이용권: #{이용권명}\n■ 만료일: #{만료일}',
    variables: (payload, context) => ({
      '#{센터명}': centerOf(payload, context),
      '#{회원명}': memberOf(payload, context),
      '#{이용권명}': str(payload.pass_name),
      '#{만료일}': formatKoreanDateKey(payload.end_date),
    }),
    sample: { pass_name: '3개월 무제한', end_date: '2026-10-01', center_name: '재키 피트니스 구미점' },
  },
  pass_remaining_one: {
    code: 'PASS_REMAINING_ONE',
    body: '[#{센터명}] 이용권 잔여 횟수 안내\n\n#{회원명}님, 이용 중인 이용권의 남은 횟수가 1회입니다.\n\n■ 이용권: #{이용권명}\n■ 남은 횟수: 1회',
    variables: (payload, context) => ({
      '#{센터명}': centerOf(payload, context),
      '#{회원명}': memberOf(payload, context),
      '#{이용권명}': str(payload.pass_name),
    }),
    sample: { pass_name: '10회권', remaining_count: 1 },
  },
  member_invite: {
    code: 'MEMBER_INVITE',
    body: '[#{센터명}] 회원 앱 연결 안내\n\n#{회원명}님, 아래 링크로 로그인하면 수업 예약과 이용권 확인을 회원 앱에서 할 수 있습니다.\n\n■ 연결 링크: #{초대링크}\n■ 유효기간: #{만료일시}까지',
    variables: (payload, context) => ({
      '#{센터명}': centerOf(payload, context),
      '#{회원명}': memberOf(payload, context),
      '#{초대링크}': str(payload.invite_url),
      '#{만료일시}': formatKoreanDateTime(payload.expires_at, timeZoneOf(payload, context)),
    }),
    sample: {
      invite_url: 'https://gymjjim.app/invite/abc123',
      expires_at: '2026-10-01T14:59:00Z',
      center_name: '재키 피트니스 구미점',
      member_name: '홍길동',
    },
  },
};

export function isNotificationType(value: string): value is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

/** 템플릿 원문에 들어 있는 변수 목록 (`#{수업명}` …) */
export function templateVariableNames(type: NotificationType): string[] {
  return Array.from(new Set(NOTIFICATION_TEMPLATES[type].body.match(/#\{[^}]+\}/g) ?? []));
}

/** 템플릿 + 알림 데이터 → 발송할 변수와 문구. 모르는 종류면 null */
export function renderNotification(
  type: string,
  payload: Payload,
  context: TemplateContext,
): RenderedNotification | null {
  if (!isNotificationType(type)) return null;
  const template = NOTIFICATION_TEMPLATES[type];
  const values = template.variables(payload, context);
  // 원문에 있는 변수만 보낸다 (변수가 원문과 다르면 알림톡이 거절된다)
  const variables = Object.fromEntries(
    templateVariableNames(type).map((name) => [name, values[name] ?? '-']),
  );
  const text = template.body.replace(/#\{[^}]+\}/g, (key) => variables[key] ?? key);
  return { type, code: template.code, variables, text };
}

/** 설정 화면 미리보기 */
export function previewNotification(type: NotificationType): RenderedNotification {
  const rendered = renderNotification(type, NOTIFICATION_TEMPLATES[type].sample, {
    memberName: '홍길동',
    centerName: '재키 피트니스 구미점',
  });
  if (!rendered) throw new Error(`unknown notification type: ${type}`);
  return rendered;
}
