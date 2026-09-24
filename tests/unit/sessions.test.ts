import { describe, expect, it } from 'vitest';

import { expandRecurrence } from '@/features/sessions/recurrence';
import { isAlmostFull, sessionAvailability } from '@/lib/session-status';

describe('expandRecurrence', () => {
  const base = { startTime: '19:00', durationMin: 60, timeZone: 'Asia/Seoul' };

  it('반복하지 않으면 1개 (19:00 KST = 10:00Z)', () => {
    expect(
      expandRecurrence({ ...base, date: '2026-09-28', repeat: false, weekdays: [], until: null }),
    ).toEqual([{ startsAt: '2026-09-28T10:00:00.000Z', endsAt: '2026-09-28T11:00:00.000Z' }]);
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
