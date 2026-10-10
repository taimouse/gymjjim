import { describe, expect, it } from 'vitest';

import { balance, booking, creditMember, setCreditCost } from './credit-helpers';
import { query, rpc, rpcError } from './helpers';
import { addMember, createSessionAt, remaining, setupScenario } from './scenario';

describe('크레딧으로 예약', () => {
  it('이용권이 없어도 크레딧으로 예약하고, 무료 취소하면 돌려받는다 (원장에 사용·환불)', async () => {
    const scenario = await setupScenario();
    await setCreditCost(scenario.programId, 5);
    const member = await creditMember(scenario, 20);
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00' });

    const preview = await rpc<{ method: string; error: string | null; credit: unknown }>(
      member.userId,
      'preview_booking',
      { p_session_id: sessionId },
    );
    expect(preview).toMatchObject({ method: 'credit', error: null, credit: { cost: 5, balance: 20 } });

    const booked = await rpc<{ booking_id: string; member_pass_id: string | null; credits_used: number }>(
      member.userId,
      'book_session',
      { p_session_id: sessionId },
    );
    expect(booked).toMatchObject({ member_pass_id: null, credits_used: 5, credit_balance: 15 });
    expect(await booking(booked.booking_id)).toMatchObject({ credits_used: 5, member_pass_id: null });
    expect(await balance(member.id)).toBe(15);

    const cancelled = await rpc<{ restored: boolean }>(member.userId, 'cancel_booking', {
      p_booking_id: booked.booking_id,
    });
    expect(cancelled.restored).toBe(true);
    expect(await balance(member.id)).toBe(20);
    expect(await booking(booked.booking_id)).toMatchObject({ credits_used: 0, status: 'cancelled' });

    const ledger = await query<{ delta: number; reason: string; balance_after: number }>(
      `select delta, reason, balance_after from public.credit_transactions where member_id = $1 order by created_at, balance_after`,
      [member.id],
    );
    expect(ledger.map((row) => [row.reason, row.delta, row.balance_after])).toEqual([
      ['charge', 20, 20],
      ['booking', -5, 15],
      ['refund', 5, 20],
    ]);
  });

  it('쓸 수 있는 이용권이 있으면 이용권(횟수권 1회)을 먼저 쓰고 크레딧은 그대로', async () => {
    const scenario = await setupScenario({ product: { type: 'count', totalCount: 10 } });
    await setCreditCost(scenario.programId, 3);
    const member = await addMember(scenario, { remaining: 10 });
    await rpc(scenario.staff.userId, 'adjust_credits', { p_member_id: member.id, p_delta: 10 });
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00' });

    const booked = await rpc<{ member_pass_id: string; credits_used: number; remaining_count: number }>(
      member.userId,
      'book_session',
      { p_session_id: sessionId },
    );
    expect(booked).toMatchObject({ member_pass_id: member.passId, credits_used: 0, remaining_count: 9 });
    expect(await balance(member.id)).toBe(10);
  });

  it('크레딧이 모자라면 CREDIT_INSUFFICIENT, 크레딧을 안 받는 프로그램은 NO_VALID_PASS', async () => {
    const scenario = await setupScenario();
    await setCreditCost(scenario.programId, 5);
    const member = await creditMember(scenario, 4);
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00' });

    const preview = await rpc<{ method: string | null; error: string }>(member.userId, 'preview_booking', {
      p_session_id: sessionId,
    });
    expect(preview).toMatchObject({
      method: null,
      error: 'CREDIT_INSUFFICIENT',
      credit: { cost: 5, balance: 4 },
    });
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessionId })).toBe(
      'CREDIT_INSUFFICIENT',
    );

    await setCreditCost(scenario.programId, null);
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessionId })).toBe('NO_VALID_PASS');
    expect(await balance(member.id)).toBe(4);
  });

  it('늦은 취소는 크레딧을 돌려주지 않고, 폐강하면 돌려준다', async () => {
    const scenario = await setupScenario({ settings: { free_cancel_hours_before: 48 } });
    await setCreditCost(scenario.programId, 2);
    const member = await creditMember(scenario, 10);
    const late = await createSessionAt(scenario, { dayOffset: 1, localTime: '10:00' });
    const other = await createSessionAt(scenario, { dayOffset: 1, localTime: '15:00' });

    const a = await rpc<{ booking_id: string }>(member.userId, 'book_session', { p_session_id: late });
    await rpc(member.userId, 'book_session', { p_session_id: other });
    expect(await balance(member.id)).toBe(6);

    const cancelled = await rpc<{ status: string; restored: boolean }>(member.userId, 'cancel_booking', {
      p_booking_id: a.booking_id,
    });
    expect(cancelled).toMatchObject({ status: 'late_cancelled', restored: false });
    expect(await balance(member.id)).toBe(6);

    const result = await rpc<{ restored_count: number }>(scenario.staff.userId, 'cancel_session', {
      p_session_id: other,
    });
    expect(result.restored_count).toBe(1);
    expect(await balance(member.id)).toBe(8);
  });

  it('대기는 승격될 때 크레딧을 쓴다 (이용권이 없을 때)', async () => {
    const scenario = await setupScenario({ product: { type: 'count', totalCount: 10 }, capacity: 1 });
    await setCreditCost(scenario.programId, 3);
    const first = await addMember(scenario, { remaining: 10 });
    const second = await creditMember(scenario, 5);
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00', capacity: 1 });

    const a = await rpc<{ booking_id: string }>(first.userId, 'book_session', { p_session_id: sessionId });
    const b = await rpc<{ booking_id: string; status: string }>(second.userId, 'book_session', {
      p_session_id: sessionId,
    });
    expect(b.status).toBe('waitlisted');
    expect(await balance(second.id)).toBe(5);

    await rpc(first.userId, 'cancel_booking', { p_booking_id: a.booking_id });
    expect(await remaining(first.passId)).toBe(10);
    expect(await booking(b.booking_id)).toMatchObject({ status: 'booked', credits_used: 3 });
    expect(await balance(second.id)).toBe(2);
  });
});
