import { TZDate } from '@date-fns/tz';
import { addDays, differenceInCalendarDays, getISODay, parseISO } from 'date-fns';

export const MAX_OCCURRENCES = 200;
export const MAX_RANGE_DAYS = 366;

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
}

export interface Occurrence {
  startsAt: string;
  endsAt: string;
}

function occurrenceOn(dateKey: string, startTime: string, durationMin: number, timeZone: string): Occurrence {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const [hour, minute] = startTime.split(':').map(Number) as [number, number];
  // TZDate.toISOString() 은 현지 오프셋을 붙이므로 UTC(Z) 문자열로 바꿔 저장한다
  const start = new TZDate(year, month - 1, day, hour, minute, timeZone).getTime();
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + durationMin * 60_000).toISOString(),
  };
}

/**
 * 반복(요일 선택 + 종료일)을 개별 수업으로 펼친다. 센터 시간대 기준 벽시계 시각을 유지한다(서머타임 안전).
 * 반복하지 않으면 첫 날짜 1개. 최대 200개·1년까지.
 */
export function expandRecurrence(input: RecurrenceInput): Occurrence[] {
  if (!input.repeat || !input.until || input.weekdays.length === 0) {
    return [occurrenceOn(input.date, input.startTime, input.durationMin, input.timeZone)];
  }
  const first = parseISO(input.date);
  const days = Math.min(differenceInCalendarDays(parseISO(input.until), first), MAX_RANGE_DAYS);
  const weekdays = new Set(input.weekdays);
  const occurrences: Occurrence[] = [];
  for (let offset = 0; offset <= days && occurrences.length < MAX_OCCURRENCES; offset += 1) {
    const day = addDays(first, offset);
    if (!weekdays.has(getISODay(day))) continue;
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    occurrences.push(occurrenceOn(key, input.startTime, input.durationMin, input.timeZone));
  }
  return occurrences;
}
