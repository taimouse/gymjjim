import { describe, expect, it } from 'vitest';

import { computePassState, passTone, pickPrimaryPass, type PassLike } from '@/lib/pass-status';

const TODAY = '2026-09-25';

function pass(overrides: Partial<PassLike> = {}): PassLike {
  return {
    status: 'active',
    start_date: '2026-09-01',
    end_date: '2026-10-31',
    remaining_count: 5,
    ...overrides,
  };
}

describe('computePassState (DB private.pass_state 와 같은 규칙)', () => {
  it('상태를 계산한다', () => {
    expect(computePassState(pass(), TODAY)).toBe('active');
    expect(computePassState(pass({ start_date: '2026-09-30' }), TODAY)).toBe('upcoming');
    expect(computePassState(pass({ end_date: '2026-09-24' }), TODAY)).toBe('expired');
    expect(computePassState(pass({ remaining_count: 0 }), TODAY)).toBe('exhausted');
    expect(
      computePassState(pass({ holds: [{ start_date: '2026-09-25', end_date: '2026-09-30' }] }), TODAY),
    ).toBe('on_hold');
    expect(computePassState(pass({ status: 'cancelled' }), TODAY)).toBe('cancelled');
  });

  it('만료일 당일은 아직 사용 중', () => {
    expect(computePassState(pass({ end_date: TODAY }), TODAY)).toBe('active');
  });
});

describe('passTone', () => {
  it('만료 7일 이내·잔여 2회 이하는 주의 색', () => {
    expect(passTone('active', 30, 10)).toBe('success');
    expect(passTone('active', 7, 10)).toBe('warning');
    expect(passTone('active', 30, 2)).toBe('warning');
    expect(passTone('on_hold', 30, 10)).toBe('info');
    expect(passTone('expired', -1, 0)).toBe('danger');
    expect(passTone(null, null, null)).toBe('muted');
  });
});

describe('pickPrimaryPass', () => {
  it('쓸 수 있는 것 중 만료 임박 순, 없으면 가장 최근 만료', () => {
    const soon = pass({ end_date: '2026-10-05' });
    const later = pass({ end_date: '2026-12-31' });
    const expired = pass({ end_date: '2026-09-01' });
    expect(pickPrimaryPass([later, expired, soon], TODAY)).toBe(soon);
    const older = pass({ end_date: '2026-08-01' });
    expect(pickPrimaryPass([older, expired], TODAY)).toBe(expired);
    expect(pickPrimaryPass([], TODAY)).toBeNull();
  });
});
