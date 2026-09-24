/**
 * 한국 센터 전용 표시 포맷 (CLAUDE.md 3-1)
 * - 날짜: `9월 24일 (목) 오후 7:00` — 저장은 UTC, 표시는 센터 시간대 기준
 * - 전화번호: 숫자만 저장, 표시는 `010-1234-5678`, 목록 마스킹은 `010-****-5678`
 * - 금액: `150,000원`
 */
import { tz } from '@date-fns/tz';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale/ko';

export const DEFAULT_TIME_ZONE = 'Asia/Seoul';

export type DateInput = Date | string | number;

function fmt(value: DateInput, pattern: string, timeZone: string): string {
  return format(value, pattern, { in: tz(timeZone), locale: ko });
}

/** `9월 24일 (목) 오후 7:00` */
export function formatDateTime(value: DateInput, timeZone = DEFAULT_TIME_ZONE): string {
  return fmt(value, 'M월 d일 (EEE) a h:mm', timeZone);
}

/** `9월 24일 (목)` */
export function formatDate(value: DateInput, timeZone = DEFAULT_TIME_ZONE): string {
  return fmt(value, 'M월 d일 (EEE)', timeZone);
}

/** `2026년 9월 24일` */
export function formatDateWithYear(value: DateInput, timeZone = DEFAULT_TIME_ZONE): string {
  return fmt(value, 'yyyy년 M월 d일', timeZone);
}

/** `9월 24일` */
export function formatMonthDay(value: DateInput, timeZone = DEFAULT_TIME_ZONE): string {
  return fmt(value, 'M월 d일', timeZone);
}

/** `오후 7:00` */
export function formatTime(value: DateInput, timeZone = DEFAULT_TIME_ZONE): string {
  return fmt(value, 'a h:mm', timeZone);
}

/** `오후 7:00 ~ 8:00` (오전/오후가 같으면 뒤쪽은 생략) */
export function formatTimeRange(start: DateInput, end: DateInput, timeZone = DEFAULT_TIME_ZONE): string {
  const sameMeridiem = fmt(start, 'a', timeZone) === fmt(end, 'a', timeZone);
  const endText = sameMeridiem ? fmt(end, 'h:mm', timeZone) : formatTime(end, timeZone);
  return `${formatTime(start, timeZone)} ~ ${endText}`;
}

/** 센터 시간대 기준 날짜 키 `2026-09-24` */
export function toDateKey(value: DateInput, timeZone = DEFAULT_TIME_ZONE): string {
  return fmt(value, 'yyyy-MM-dd', timeZone);
}

/** 센터 시간대 기준 오늘 `2026-09-24` */
export function todayKey(timeZone = DEFAULT_TIME_ZONE, now: DateInput = new Date()): string {
  return toDateKey(now, timeZone);
}

/**
 * 만료일까지 남은 일수. 만료일 당일은 0, 지나면 음수.
 * 두 인자 모두 `yyyy-MM-dd` 날짜 키(센터 시간대 기준)다.
 */
export function daysUntil(endDateKey: string, todayDateKey: string): number {
  return differenceInCalendarDays(parseISO(endDateKey), parseISO(todayDateKey));
}

/** `D-12`, `D-day`, `D+3` */
export function formatDDay(daysLeft: number): string {
  if (daysLeft === 0) return 'D-day';
  return daysLeft > 0 ? `D-${daysLeft}` : `D+${Math.abs(daysLeft)}`;
}

/* ───────────── 전화번호 ───────────── */

/** 입력값에서 숫자만 남긴다. `+82 10-1234-5678` → `01012345678` */
export function normalizePhone(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

/** 휴대전화 번호(010, 011, 016~019) 여부 */
export function isMobilePhone(digits: string): boolean {
  return /^01[016789]\d{7,8}$/.test(digits);
}

function splitPhone(digits: string): string[] | null {
  if (/^(15|16|18)\d{6}$/.test(digits)) return [digits.slice(0, 4), digits.slice(4)];
  const areaLength = digits.startsWith('02') ? 2 : 3;
  const rest = digits.slice(areaLength);
  if (rest.length === 7) return [digits.slice(0, areaLength), rest.slice(0, 3), rest.slice(3)];
  if (rest.length === 8) return [digits.slice(0, areaLength), rest.slice(0, 4), rest.slice(4)];
  return null;
}

/** `01012345678` → `010-1234-5678` */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = normalizePhone(value);
  return splitPhone(digits)?.join('-') ?? digits;
}

/** 목록용 가운데 마스킹 `010-****-5678` */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = normalizePhone(value);
  const parts = splitPhone(digits);
  if (!parts) return digits.length > 4 ? `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}` : digits;
  if (parts.length === 2) return `${parts[0]}-${parts[1]}`;
  const [area, middle, last] = parts as [string, string, string];
  return `${area}-${'*'.repeat(middle.length)}-${last}`;
}

/** 전화번호 뒷 4자리 */
export function phoneLast4(value: string): string {
  return normalizePhone(value).slice(-4);
}

/* ───────────── 금액 ───────────── */

const numberFormatter = new Intl.NumberFormat('ko-KR');

/** `150000` → `150,000` */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** `150000` → `150,000원` */
export function formatWon(value: number): string {
  return `${formatNumber(value)}원`;
}

/** 콤마·원 표기가 섞인 입력을 정수로. 숫자가 없으면 null */
export function parseWon(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;
  return Number.parseInt(digits, 10);
}
