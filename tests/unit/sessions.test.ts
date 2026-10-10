import { describe, expect, it } from 'vitest';

import { expandRecurrence } from '@/features/sessions/recurrence';
import { isAlmostFull, sessionAvailability } from '@/lib/session-status';

describe('expandRecurrence', () => {
  const base = { startTime: '19:00', durationMin: 60, timeZone: 'Asia/Seoul' };

  it('반복하지 않으면 1개 (19:00 KST = 10:00Z)', () => {
    expect(
      expandRecurrence({ ...base, date: '2026-09-28', repeat: false, weekdays: [], until: null }),
    ).toEqual([
      { date: '2026-09-28', startsAt: '2026-09-28T10:00:00.000Z', endsAt: '2026-09-28T11:00:00.000Z' },
    ]);
  });

  it('월·수·금 2주 → 6개', () => {
    const result = expandRecurrence({
      ...base,
      date: '2026-09-28',
      repeat: true,
      weekdays: [1, 3, 5],
      until: '2026-10-11',
    });
    expect(result.map((item) => item.startsAt.slice(0, 10))).toEqual([
      '2026-09-28',
      '2026-09-30',
      '2026-10-02',
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
    ]);
  });

  it('첫 날짜가 선택 요일이 아니면 건너뛴다', () => {
    const result = expandRecurrence({
      ...base,
      date: '2026-09-29',
      repeat: true,
      weekdays: [1],
      until: '2026-10-06',
    });
    expect(result.map((item) => item.startsAt.slice(0, 10))).toEqual(['2026-10-05']);
  });

  const repeat = { ...base, repeat: true, weekdays: [] as number[], until: null };
  const dates = (input: Parameters<typeof expandRecurrence>[0]) =>
    expandRecurrence(input).map((item) => item.date);

  it('격주(2주마다) 화요일', () => {
    expect(dates({ ...repeat, date: '2026-10-06', weekdays: [2], interval: 2, until: '2026-11-10' })).toEqual(
      ['2026-10-06', '2026-10-20', '2026-11-03'],
    );
  });

  it('횟수로 끝내기: 월·목 5회', () => {
    expect(dates({ ...repeat, date: '2026-10-05', weekdays: [1, 4], endMode: 'count', count: 5 })).toEqual([
      '2026-10-05',
      '2026-10-08',
      '2026-10-12',
      '2026-10-15',
      '2026-10-19',
    ]);
  });

  it('매월 같은 날짜, 그 날짜가 없는 달은 건너뛴다', () => {
    expect(
      dates({
        ...repeat,
        date: '2026-01-31',
        frequency: 'monthly',
        monthlyMode: 'date',
        until: '2026-06-30',
      }),
    ).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  it('매월 둘째·마지막 토요일', () => {
    expect(
      dates({
        ...repeat,
        date: '2026-10-01',
        frequency: 'monthly',
        monthlyMode: 'weekday',
        weekdays: [6],
        monthWeeks: [2, 5],
        until: '2026-12-31',
      }),
    ).toEqual(['2026-10-10', '2026-10-31', '2026-11-14', '2026-11-28', '2026-12-12', '2026-12-26']);
  });

  it('2개월마다 첫째 월요일', () => {
    expect(
      dates({
        ...repeat,
        date: '2026-10-01',
        frequency: 'monthly',
        monthlyMode: 'weekday',
        weekdays: [1],
        monthWeeks: [1],
        interval: 2,
        endMode: 'count',
        count: 3,
      }),
    ).toEqual(['2026-10-05', '2026-12-07', '2027-02-01']);
  });

  it('제외 날짜(공휴일)는 빼고 만든다', () => {
    expect(
      dates({
        ...repeat,
        date: '2026-10-05',
        weekdays: [1, 3, 5],
        until: '2026-10-09',
        excludeDates: ['2026-10-09'],
      }),
    ).toEqual(['2026-10-05', '2026-10-07']);
  });

  it('규칙이 덜 채워지면(요일 없음) 첫 날짜 1개', () => {
    expect(dates({ ...repeat, date: '2026-10-05', until: '2026-10-30' })).toEqual(['2026-10-05']);
  });

  it('최대 200개까지만', () => {
    expect(
      expandRecurrence({
        ...repeat,
        date: '2026-01-01',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        until: '2026-12-31',
      }),
    ).toHaveLength(200);
  });

  it('서머타임 지역에서도 벽시계 시각을 유지한다', () => {
    const result = expandRecurrence({
      startTime: '09:00',
      durationMin: 60,
      timeZone: 'America/New_York',
      date: '2026-10-31',
      repeat: true,
      weekdays: [6, 7],
      until: '2026-11-01',
    });
    // 11/1 에 서머타임이 끝나 UTC 오프셋이 -4 → -5 로 바뀐다
    expect(result.map((item) => item.startsAt)).toEqual([
      '2026-10-31T13:00:00.000Z',
      '2026-11-01T14:00:00.000Z',
    ]);
  });
});

describe('sessionAvailability', () => {
  const session = {
    starts_at: '2026-09-25T10:00:00Z',
    ends_at: '2026-09-25T11:00:00Z',
    capacity: 10,
    booked_count: 3,
    status: 'scheduled' as const,
  };
  const before = new Date('2026-09-25T08:00:00Z');

  it('예약가능 / 마감임박 / 대기가능', () => {
    expect(sessionAvailability(session, 30, before)).toBe('open');
    expect(sessionAvailability({ ...session, booked_count: 8 }, 30, before)).toBe('almost');
    expect(sessionAvailability({ ...session, booked_count: 10 }, 30, before)).toBe('waitlist');
  });

  it('마감(시작 30분 전) / 종료 / 폐강', () => {
    expect(sessionAvailability(session, 30, new Date('2026-09-25T09:31:00Z'))).toBe('closed');
    expect(sessionAvailability(session, 30, new Date('2026-09-25T11:00:00Z'))).toBe('ended');
    expect(sessionAvailability({ ...session, status: 'cancelled' }, 30, before)).toBe('cancelled');
  });

  it('마감임박: 남은 자리 2개 이하 또는 정원의 20% 이하', () => {
    expect(isAlmostFull({ capacity: 20, booked_count: 16 })).toBe(true);
    expect(isAlmostFull({ capacity: 20, booked_count: 15 })).toBe(false);
    expect(isAlmostFull({ capacity: 1, booked_count: 0 })).toBe(true);
    expect(isAlmostFull({ capacity: 10, booked_count: 10 })).toBe(false);
  });
});
