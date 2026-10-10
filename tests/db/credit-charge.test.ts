import { describe, expect, it } from 'vitest';

import { balance, creditMember } from './credit-helpers';
import { createProduct, createStaff } from './factories';
import { query, queryOne, rpc, rpcError, withUser } from './helpers';
import { setupScenario } from './scenario';

describe('크레딧 충전', () => {
  it('회원 충전 요청 → 직원 승인하면 충전 (대기 중인 요청은 하나만)', async () => {
    const scenario = await setupScenario();
    await query(`update public.centers set credit_price = 6000 where id = $1`, [scenario.centerId]);
    const member = await creditMember(scenario, 0);

    const requestId = await rpc<string>(member.userId, 'request_credit_charge', {
      p_center_id: scenario.centerId,
      p_amount: 10,
    });
    expect(
      await rpcError(member.userId, 'request_credit_charge', { p_center_id: scenario.centerId, p_amount: 5 }),
    ).toBe('CREDIT_REQUEST_PENDING');

    const mine = await rpc<{ balance: number; price: number; pending: { id: string; unit_price: number } }>(
      member.userId,
      'my_credits',
      { p_center_id: scenario.centerId },
    );
    expect(mine).toMatchObject({
      balance: 0,
      price: 6000,
      pending: { id: requestId, amount: 10, unit_price: 6000 },
    });

    // 회원은 스스로 승인할 수 없다
    expect(
      await rpcError(member.userId, 'decide_credit_request', { p_request_id: requestId, p_approve: true }),
    ).toBe('CREDIT_REQUEST_NOT_FOUND');

    const decided = await rpc<{ balance: number }>(scenario.staff.userId, 'decide_credit_request', {
      p_request_id: requestId,
      p_approve: true,
    });
    expect(decided.balance).toBe(10);
    expect(await balance(member.id)).toBe(10);
    expect(
      await rpcError(scenario.staff.userId, 'decide_credit_request', {
        p_request_id: requestId,
        p_approve: true,
      }),
    ).toBe('CREDIT_REQUEST_CLOSED');

    const tx = await queryOne<{ request_id: string; created_by: string; reason: string }>(
      `select request_id, created_by, reason from public.credit_transactions where member_id = $1`,
      [member.id],
    );
    expect(tx).toMatchObject({ request_id: requestId, created_by: scenario.staff.id, reason: 'charge' });
  });

  it('회원은 대기 중인 요청을 취소하고, 직원이 거절하면 충전되지 않는다', async () => {
    const scenario = await setupScenario();
    const member = await creditMember(scenario, 0);
    const first = await rpc<string>(member.userId, 'request_credit_charge', {
      p_center_id: scenario.centerId,
      p_amount: 10,
    });
    await rpc(member.userId, 'cancel_credit_request', { p_request_id: first });
    const second = await rpc<string>(member.userId, 'request_credit_charge', {
      p_center_id: scenario.centerId,
      p_amount: 20,
    });
    await rpc(scenario.owner.userId, 'decide_credit_request', { p_request_id: second, p_approve: false });

    const rows = await query<{ status: string }>(
      `select status from public.credit_requests where member_id = $1 order by created_at`,
      [member.id],
    );
    expect(rows.map((row) => row.status)).toEqual(['cancelled', 'rejected']);
    expect(await balance(member.id)).toBe(0);
  });

  it('직원 직접 충전·차감: 잔액보다 많이 빼면 CREDIT_INSUFFICIENT, 다른 센터 직원은 못 한다', async () => {
    const scenario = await setupScenario();
    const member = await creditMember(scenario, 10);
    expect(
      await rpc<number>(scenario.staff.userId, 'adjust_credits', {
        p_member_id: member.id,
        p_delta: -3,
        p_memo: '정정',
      }),
    ).toBe(7);
    expect(
      await rpcError(scenario.staff.userId, 'adjust_credits', { p_member_id: member.id, p_delta: -8 }),
    ).toBe('CREDIT_INSUFFICIENT');

    const otherCenter = await setupScenario();
    expect(
      await rpcError(otherCenter.staff.userId, 'adjust_credits', { p_member_id: member.id, p_delta: 5 }),
    ).toBe('MEMBER_NOT_FOUND');
    expect(await balance(member.id)).toBe(7);
  });

  it('회원은 자기 원장만 보고, 잔액을 직접 바꿀 수 없다', async () => {
    const scenario = await setupScenario();
    const member = await creditMember(scenario, 10);
    const other = await creditMember(scenario, 5);
    const visible = await withUser(member.userId, async (client) => {
      const { rows } = await client.query<{ member_id: string }>(
        `select member_id from public.credit_transactions`,
      );
      return rows.map((row) => row.member_id);
    });
    expect(visible).toEqual([member.id]);
    expect(visible).not.toContain(other.id);

    const staff = await createStaff(scenario.centerId, 'staff');
    const error = await withUser(staff.userId, (client) =>
      client.query(`update public.members set credit_balance = 999 where id = $1`, [member.id]).then(
        () => null,
        (cause: { code?: string }) => cause.code,
      ),
    );
    expect(error).toBe('42501');
    expect(await balance(member.id)).toBe(10);
  });

  it('save_program 으로 크레딧 가격을 저장하고 비울 수 있다', async () => {
    const scenario = await setupScenario();
    const productId = await createProduct(scenario.centerId, { type: 'count', totalCount: 10 });
    const args = {
      p_center_id: scenario.centerId,
      p_name: '플라잉요가',
      p_type: 'group',
      p_default_capacity: 8,
      p_duration_min: 50,
      p_color: '#FBCFE8',
      p_allowed_product_ids: [productId],
    };
    const id = await rpc<string>(scenario.owner.userId, 'save_program', { ...args, p_credit_cost: 3 });
    const cost = async () =>
      (
        await queryOne<{ credit_cost: number | null }>(
          `select credit_cost from public.programs where id = $1`,
          [id],
        )
      ).credit_cost;
    expect(await cost()).toBe(3);
    await rpc(scenario.owner.userId, 'save_program', { ...args, p_id: id });
    expect(await cost()).toBeNull();
  });

  it('회원은 자기 센터 프로그램의 사용 가능 이용권 연결을 본다 (다른 센터 것은 못 본다)', async () => {
    const scenario = await setupScenario();
    const other = await setupScenario();
    const member = await creditMember(scenario, 0);
    const programs = await withUser(member.userId, async (client) => {
      const { rows } = await client.query<{ program_id: string }>(
        `select program_id from public.program_allowed_products`,
      );
      return rows.map((row) => row.program_id);
    });
    expect(programs).toEqual([scenario.programId]);
    expect(programs).not.toContain(other.programId);
  });
});
