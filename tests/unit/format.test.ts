import { describe, expect, it } from 'vitest';

import {
  dayRangeUtc,
  daysUntil,
  formatDate,
  formatDateTime,
  formatDateWithYear,
  formatDDay,
  formatMonthKey,
  formatNumber,
  formatPhone,
  formatShortDateKey,
  formatTime,
  formatTimeRange,
  formatWon,
  isMobilePhone,
  maskPhone,
  normalizePhone,
  parseWon,
  phoneLast4,
  toDateKey,
  todayKey,
} from '@/lib/format';

// 2026-09-24 10:00 UTC = 2026-09-24 19:00 KST (목)
const EVENING_KST = '2026-09-24T10:00:00Z';

describe('날짜 포맷', () => {
  it('CLAUDE.md 표기 예시와 같다: 9월 24일 (목) 오후 7:00', () => {
    expect(formatDateTime(EVENING_KST)).toBe('9월 24일 (목) 오후 7:00');
  });

  it('Date·타임스탬프 입력도 같은 결과', () => {
    const date = new Date(EVENING_KST);
    expect(formatDateTime(date)).toBe('9월 24일 (목) 오후 7:00');
    expect(formatDateTime(date.getTime())).toBe('9월 24일 (목) 오후 7:00');
  });

  it('UTC 자정 직전은 서울 기준 다음 날이다', () => {
    expect(formatDate('2026-09-24T15:30:00Z')).toBe('9월 25일 (금)');
    expect(toDateKey('2026-09-24T15:30:00Z')).toBe('2026-09-25');
  });

  it('센터 시간대를 지정할 수 있다', () => {
    expect(formatTime(EVENING_KST, 'UTC')).toBe('오전 10:00');
  });

  it('오전 표기와 연도 포함 날짜', () => {
    expect(formatTime('2026-09-23T22:30:00Z')).toBe('오전 7:30');
    expect(formatDateWithYear(EVENING_KST)).toBe('2026년 9월 24일');
  });

  it('시간 범위는 오전/오후가 같으면 뒤쪽을 생략한다', () => {
    expect(formatTimeRange(EVENING_KST, '2026-09-24T11:00:00Z')).toBe('오후 7:00 ~ 8:00');
    expect(formatTimeRange('2026-09-24T02:30:00Z', '2026-09-24T03:30:00Z')).toBe('오전 11:30 ~ 오후 12:30');
  });

  it('오늘 날짜 키는 센터 시간대 기준', () => {
    expect(todayKey('Asia/Seoul', new Date('2026-09-24T16:00:00Z'))).toBe('2026-09-25');
  });
});

describe('날짜 키', () => {
  it('차트용 짧은 날짜와 월 표기', () => {
    expect(formatShortDateKey('2026-09-24')).toBe('9/24 (목)');
    expect(formatMonthKey('2026-09-01')).toBe('9월');
    expect(formatMonthKey('2026-09-01', { year: true })).toBe('2026년 9월');
  });

  it('센터 시간대의 하루를 UTC 구간으로 바꾼다', () => {
    expect(dayRangeUtc('2026-09-24', 'Asia/Seoul')).toEqual({
      from: '2026-09-23T15:00:00.000Z',
      to: '2026-09-24T15:00:00.000Z',
    });
    // 서머타임이 바뀌는 날은 23시간
    expect(dayRangeUtc('2026-03-08', 'America/New_York')).toEqual({
      from: '2026-03-08T05:00:00.000Z',
      to: '2026-03-09T04:00:00.000Z',
    });
  });
});

describe('D-day', () => {
  it('남은 일수를 계산한다', () => {
    expect(daysUntil('2026-10-06', '2026-09-24')).toBe(12);
    expect(daysUntil('2026-09-24', '2026-09-24')).toBe(0);
    expect(daysUntil('2026-09-21', '2026-09-24')).toBe(-3);
  });

  it('D-12 / D-day / D+3 로 표기한다', () => {
    expect(formatDDay(12)).toBe('D-12');
    expect(formatDDay(0)).toBe('D-day');
    expect(formatDDay(-3)).toBe('D+3');
  });
});

describe('전화번호', () => {
  it('숫자만 남긴다', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(normalizePhone(' 010 1234 5678 ')).toBe('01012345678');
    expect(normalizePhone('+82 10-1234-5678')).toBe('01012345678');
  });

  it('010-1234-5678 형식으로 표시한다', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
    expect(formatPhone('0111234567')).toBe('011-123-4567');
    expect(formatPhone('050713743962')).toBe('0507-1374-3962');
    expect(maskPhone('050713743962')).toBe('0507-****-3962');
    expect(formatPhone('0212345678')).toBe('02-1234-5678');
    expect(formatPhone('021234567')).toBe('02-123-4567');
    expect(formatPhone('0311234567')).toBe('031-123-4567');
    expect(formatPhone('15881234')).toBe('1588-1234');
    expect(formatPhone('')).toBe('');
    expect(formatPhone(null)).toBe('');
  });

  it('형식을 알 수 없으면 숫자 그대로', () => {
    expect(formatPhone('12345')).toBe('12345');
  });

  it('목록에서는 가운데를 마스킹한다', () => {
    expect(maskPhone('01012345678')).toBe('010-****-5678');
    expect(maskPhone('0111234567')).toBe('011-***-4567');
    expect(maskPhone(null)).toBe('');
  });

  it('휴대전화 번호와 뒷 4자리', () => {
    expect(isMobilePhone('01012345678')).toBe(true);
    expect(isMobilePhone('0111234567')).toBe(true);
    expect(isMobilePhone('0212345678')).toBe(false);
    expect(isMobilePhone('0101234')).toBe(false);
    expect(phoneLast4('010-1234-5678')).toBe('5678');
  });
});

describe('금액', () => {
  it('원 단위 콤마 표기', () => {
    expect(formatWon(150000)).toBe('150,000원');
    expect(formatWon(0)).toBe('0원');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('콤마·원 표기가 섞인 입력을 숫자로 바꾼다', () => {
    expect(parseWon('150,000원')).toBe(150000);
    expect(parseWon('  1,000 ')).toBe(1000);
    expect(parseWon('')).toBeNull();
    expect(parseWon('원')).toBeNull();
  });
});
