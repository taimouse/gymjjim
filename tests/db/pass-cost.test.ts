import { describe, expect, it } from 'vitest';

import { createProduct } from './factories';
import { query, queryOne, rpc, rpcError } from './helpers';
import { addMember, createSessionAt, remaining, setupScenario } from './scenario';

/** 프로그램 차감 횟수를 바꾼다 */
const setCost = (programId: string, cost: number) =>
  query(`update public.programs set pass_cost = $2 where id = $1`, [programId, cost]);

const deducted = async (bookingId: string) =>
  (
    await queryOne<{ deducted_count: number; pass_deducted: boolean }>(
      `select deducted_count, pass_deducted from public.bookings where id = $1`,
      [bookingId],
    )
  ).deducted_count;

describe('프로그램별 횟수권 차감 횟수', () => {
  it('예약하면 프로그램의 차감 횟수만큼 줄고, 무료 취소하면 같은 만큼 복구된다', async () => {
    const scenario = await setupScenario({ product: { type: 'count', totalCount: 20 } });
    await setCost(scenario.programId, 3);
    const member = await addMember(scenario, { remaining: 20 });
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00' });

    const booked = await rpc<{ booking_id: string; remaining_count: number; deducted_count: number }>(
      member.userId,
      'book_session',
      { p_session_id: sessionId },
    );
    expect(booked).toMatchObject({ remaining_count: 17, deducted_count: 3 });
    expect(await deducted(booked.booking_id)).toBe(3);

    const cancelled = await rpc<{ status: string; restored: boolean }>(member.userId, 'cancel_booking', {
      p_booking_id: booked.booking_id,
    });
    expect(cancelled).toMatchObject({ status: 'cancelled', restored: true });
    expect(await remaining(member.passId)).toBe(20);
    expect(await deducted(booked.booking_id)).toBe(0);
  });

  it('남은 횟수가 차감 횟수보다 적으면 PASS_INSUFFICIENT (미리보기에도 차감 횟수와 사유)', async () => {
    const scenario = await setupScenario({ product: { type: 'count', totalCount: 20 } });
    await setCost(scenario.programId, 5);
    const member = await addMember(scenario, { remaining: 4 });
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00' });

    const preview = await rpc<{ cost: number; error: string | null; pass: unknown }>(
      member.userId,
      'preview_booking',
      { p_session_id: sessionId },
    );
    expect(preview).toMatchObject({ cost: 5, error: 'PASS_INSUFFICIENT', pass: null });
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessionId })).toBe(
      'PASS_INSUFFICIENT',
    );
    expect(await remaining(member.passId)).toBe(4);
  });

  it('기간권은 차감 횟수와 관계없이 차감하지 않는다', async () => {
    const scenario = await setupScenario({ product: { type: 'period' } });
    await setCost(scenario.programId, 3);
    const member = await addMember(scenario);
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00' });
    const booked = await rpc<{ booking_id: string; deducted_count: number }>(member.userId, 'book_session', {
      p_session_id: sessionId,
    });
    expect(booked.deducted_count).toBe(0);
    expect(await deducted(booked.booking_id)).toBe(0);
  });

  it('대기 승격 때도 차감 횟수만큼, 폐강하면 같은 만큼 복구', async () => {
    const scenario = await setupScenario({ product: { type: 'count', totalCount: 20 }, capacity: 1 });
    await setCost(scenario.programId, 2);
    const first = await addMember(scenario, { remaining: 20 });
    const second = await addMember(scenario, { remaining: 20 });
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00', capacity: 1 });

    const a = await rpc<{ booking_id: string }>(first.userId, 'book_session', { p_session_id: sessionId });
    const b = await rpc<{ booking_id: string; status: string }>(second.userId, 'book_session', {
      p_session_id: sessionId,
    });
    expect(b.status).toBe('waitlisted');
    expect(await remaining(second.passId)).toBe(20);

    await rpc(first.userId, 'cancel_booking', { p_booking_id: a.booking_id });
    expect(await remaining(second.passId)).toBe(18);
    expect(await deducted(b.booking_id)).toBe(2);

    const result = await rpc<{ restored_count: number }>(scenario.staff.userId, 'cancel_session', {
      p_session_id: sessionId,
    });
    expect(result.restored_count).toBe(1);
    expect(await remaining(second.passId)).toBe(20);
  });

  it('save_program 으로 차감 횟수를 저장한다 (기본 1)', async () => {
    const scenario = await setupScenario();
    const productId = await createProduct(scenario.centerId, { type: 'count', totalCount: 20 });
    const args = {
      p_center_id: scenario.centerId,
      p_name: '플라잉요가',
      p_type: 'group',
      p_default_capacity: 8,
      p_duration_min: 50,
      p_color: '#FBCFE8',
      p_allowed_product_ids: [productId],
    };
    const id = await rpc<string>(scenario.owner.userId, 'save_program', { ...args, p_pass_cost: 3 });
    const cost = async () =>
      (await queryOne<{ pass_cost: number }>(`select pass_cost from public.programs where id = $1`, [id]))
        .pass_cost;
    expect(await cost()).toBe(3);
    await rpc(scenario.owner.userId, 'save_program', { ...args, p_id: id });
    expect(await cost()).toBe(1);
  });
});
