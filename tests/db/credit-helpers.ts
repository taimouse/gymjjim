import { createMember } from './factories';
import { query, queryOne, rpc } from './helpers';
import type { Scenario } from './scenario';

/** 프로그램의 크레딧 가격 (null = 크레딧 안 받음) */
export const setCreditCost = (programId: string, cost: number | null) =>
  query(`update public.programs set credit_cost = $2 where id = $1`, [programId, cost]);

/** 이용권 없는 로그인 회원 + 크레딧 */
export async function creditMember(scenario: Scenario, credits: number) {
  const member = await createMember(scenario.centerId);
  if (credits > 0) {
    await rpc(scenario.staff.userId, 'adjust_credits', { p_member_id: member.id, p_delta: credits });
  }
  return { id: member.id, userId: member.userId! };
}

export const balance = async (memberId: string) =>
  (
    await queryOne<{ credit_balance: number }>(`select credit_balance from public.members where id = $1`, [
      memberId,
    ])
  ).credit_balance;

export const booking = (bookingId: string) =>
  queryOne<{ credits_used: number; member_pass_id: string | null; status: string }>(
    `select credits_used, member_pass_id, status from public.bookings where id = $1`,
    [bookingId],
  );
