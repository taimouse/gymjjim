import { describe, expect, it } from 'vitest';

import {
  bookSessionResult,
  cancelBookingInput,
  createHoldInput,
  staffBookInput,
} from '@/features/booking/schema';

const ID = 'c0000000-0000-4000-8000-000000000001';

describe('예약 스키마', () => {
  it('uuid 가 아니면 거부한다', () => {
    expect(cancelBookingInput.safeParse({ bookingId: 'abc' }).success).toBe(false);
  });

  it('기본값을 채운다', () => {
    expect(cancelBookingInput.parse({ bookingId: ID })).toEqual({ bookingId: ID, waivePenalty: false });
    expect(staffBookInput.parse({ sessionId: ID, memberId: ID })).toMatchObject({
      overrideRules: false,
      allowOverCapacity: false,
      waitlist: false,
    });
  });

  it('정지 종료일은 시작일보다 앞설 수 없다', () => {
    expect(
      createHoldInput.safeParse({ memberPassId: ID, startDate: '2026-10-01', endDate: '2026-10-07' }).success,
    ).toBe(true);
    const invalid = createHoldInput.safeParse({
      memberPassId: ID,
      startDate: '2026-10-07',
      endDate: '2026-10-01',
    });
    expect(invalid.success).toBe(false);
    expect(
      createHoldInput.safeParse({ memberPassId: ID, startDate: '10/01', endDate: '2026-10-07' }).success,
    ).toBe(false);
  });

  it('RPC 결과(jsonb)를 검증한다', () => {
    const valid = {
      booking_id: ID,
      status: 'waitlisted',
      waitlist_position: 2,
      member_pass_id: ID,
      remaining_count: null,
      credits_used: 0,
      credit_balance: 10,
    };
    expect(bookSessionResult.parse(valid)).toEqual(valid);
    // 크레딧으로 예약하면 이용권이 없다
    expect(
      bookSessionResult.safeParse({ ...valid, member_pass_id: null, credits_used: 3, credit_balance: 7 })
        .success,
    ).toBe(true);
    expect(bookSessionResult.safeParse({ ...valid, status: 'attended' }).success).toBe(false);
  });
});
