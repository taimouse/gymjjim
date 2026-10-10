import { TZDate } from '@date-fns/tz';
import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  getDaysInMonth,
  getISODay,
  parseISO,
} from 'date-fns';

export const MAX_OCCURRENCES = 200;
export const MAX_RANGE_DAYS = 366;

/** 반복 단위: 매주(N주마다) / 매월(N개월마다) */
export const FREQUENCIES = ['weekly', 'monthly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** 매월 반복 방식: 같은 날짜(예: 매월 15일) / n번째 요일(예: 매월 둘째·넷째 화요일) */
export const MONTHLY_MODES = ['date', 'weekday'] as const;
export type MonthlyMode = (typeof MONTHLY_MODES)[number];

/** 반복 끝: 종료일까지 / 횟수만큼 */
export const END_MODES = ['until', 'count'] as const;
export type EndMode = (typeof END_MODES)[number];

/** 매월 n번째 주 선택값. 1~4 = 첫째~넷째, 5 = 마지막 주 */
export const MONTH_WEEKS = [1, 2, 3, 4, 5] as const;
export const LAST_WEEK = 5;

export interface RecurrenceInput {
  /** 첫 수업 날짜 yyyy-MM-dd (센터 시간대 기준) */
  date: string;
  /** 시작 시각 HH:mm */
  startTime: string;
  durationMin: number;
  repeat: boolean;
  /** ISO 요일 1=월 … 7=일 */
  weekdays: number[];
  /** 반복 종료일 yyyy-MM-dd (포함) */
  until: string | null;
  timeZone: string;
  frequency?: Frequency;
  /** N주마다 / N개월마다 (기본 1) */
  interval?: number;
  monthlyMode?: MonthlyMode;
  /** 매월 n번째 요일 반복에서 고른 주 (1~4, 5 = 마지막) */
  monthWeeks?: number[];
  endMode?: EndMode;
  /** endMode = count 일 때 만들 횟수 */
  count?: number;
  /** 빼고 만들 날짜 yyyy-MM-dd (공휴일·센터 휴무일 등) */
  excludeDates?: string[];
}

export interface Occurrence {
  /** 센터 시간대 날짜 yyyy-MM-dd */
  date: string;
  startsAt: string;
  endsAt: string;
}

/** 센터 시간대의 날짜·시각 → UTC ISO 문자열 (서머타임 안전) */
export function localToUtc(dateKey: string, time: string, timeZone: string): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  // TZDate.toISOString() 은 현지 오프셋을 붙이므로 UTC(Z) 문자열로 바꿔 저장한다
  return new Date(new TZDate(year, month - 1, day, hour, minute, timeZone).getTime()).toISOString();
}

function occurrenceOn(dateKey: string, startTime: string, durationMin: number, timeZone: string): Occurrence {
  const startsAt = localToUtc(dateKey, startTime, timeZone);
  return {
    date: dateKey,
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + durationMin * 60_000).toISOString(),
  };
}

function keyOf(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

/** 그 달의 몇 번째 같은 요일인지 (1~5) */
function nthWeekdayOfMonth(day: Date): number {
  return Math.ceil(day.getDate() / 7);
}

function isLastWeekdayOfMonth(day: Date): boolean {
  return day.getDate() + 7 > getDaysInMonth(day);
}

function matches(day: Date, first: Date, input: RecurrenceInput, weekdays: ReadonlySet<number>): boolean {
  const interval = Math.max(1, input.interval ?? 1);
  if ((input.frequency ?? 'weekly') === 'weekly') {
    if (!weekdays.has(getISODay(day))) return false;
    return differenceInCalendarWeeks(day, first, { weekStartsOn: 1 }) % interval === 0;
  }
  if (differenceInCalendarMonths(day, first) % interval !== 0) return false;
  if ((input.monthlyMode ?? 'date') === 'date') return day.getDate() === first.getDate();
  if (!weekdays.has(getISODay(day))) return false;
  const weeks = new Set(input.monthWeeks ?? []);
  return weeks.has(nthWeekdayOfMonth(day)) || (weeks.has(LAST_WEEK) && isLastWeekdayOfMonth(day));
}

/** 반복 규칙이 빠진 값 없이 채워졌는지 (덜 채워졌으면 첫 날짜 1개만 만든다) */
function isComplete(input: RecurrenceInput): boolean {
  const frequency = input.frequency ?? 'weekly';
  const needsWeekdays = frequency === 'weekly' || (input.monthlyMode ?? 'date') === 'weekday';
  if (needsWeekdays && input.weekdays.length === 0) return false;
  if (frequency === 'monthly' && input.monthlyMode === 'weekday' && (input.monthWeeks ?? []).length === 0)
    return false;
  return (input.endMode ?? 'until') === 'count' ? (input.count ?? 0) > 0 : !!input.until;
}

/**
 * 반복 규칙을 개별 수업으로 펼친다. 센터 시간대 기준 벽시계 시각을 유지한다(서머타임 안전).
 * - 매주: 고른 요일마다, N주 간격
 * - 매월: 같은 날짜 또는 n번째(마지막) 요일, N개월 간격. 그 날짜가 없는 달(31일 등)은 건너뛴다
 * - 끝: 종료일(포함) 또는 횟수. 최대 200개·1년까지
 * - 제외 날짜는 펼친 뒤에 뺀다 (횟수로 끝내는 경우 제외한 만큼 줄어든다)
 * 반복하지 않으면 첫 날짜 1개.
 */
export function expandRecurrence(input: RecurrenceInput): Occurrence[] {
  if (!input.repeat || !isComplete(input)) {
    return [occurrenceOn(input.date, input.startTime, input.durationMin, input.timeZone)];
  }
  const first = parseISO(input.date);
  const byCount = (input.endMode ?? 'until') === 'count';
  const limit = byCount ? Math.min(input.count ?? 1, MAX_OCCURRENCES) : MAX_OCCURRENCES;
  const days = byCount
    ? MAX_RANGE_DAYS
    : Math.min(differenceInCalendarDays(parseISO(input.until ?? input.date), first), MAX_RANGE_DAYS);
  const weekdays = new Set(input.weekdays);
  const dates: string[] = [];
  for (let offset = 0; offset <= days && dates.length < limit; offset += 1) {
    const day = addDays(first, offset);
    if (matches(day, first, input, weekdays)) dates.push(keyOf(day));
  }
  const excluded = new Set(input.excludeDates ?? []);
  return dates
    .filter((key) => !excluded.has(key))
    .map((key) => occurrenceOn(key, input.startTime, input.durationMin, input.timeZone));
}
