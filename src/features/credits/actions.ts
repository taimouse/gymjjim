'use server';

import { z } from 'zod';

import { staffActionContext } from '@/lib/auth/action-context';
import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

import {
  type AdjustCreditsValues,
  adjustCreditsSchema,
  type ChargeRequestValues,
  chargeRequestSchema,
  type CreditPriceValues,
  creditPriceSchema,
} from './schema';

const id = z.uuid();

/** 충전 요청 (회원). 결제 연동 전이라 직원이 입금을 확인하고 승인한다 */
export async function requestCreditCharge(
  values: ChargeRequestValues,
): Promise<Result<{ requestId: string }>> {
  const parsed = chargeRequestSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_credit_charge', {
    p_center_id: parsed.data.centerId,
    p_amount: parsed.data.amount,
  });
  if (error || !id.safeParse(data).success) return fail(toAppErrorCode(error));
  return ok({ requestId: data });
}

/** 대기 중인 충전 요청 취소 (회원 본인) */
export async function cancelCreditRequest(requestId: string): Promise<Result<null>> {
  if (!id.safeParse(requestId).success) return fail('VALIDATION');
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_credit_request', { p_request_id: requestId });
  if (error) return fail(toAppErrorCode(error));
  return ok(null);
}

/** 충전 요청 승인·거절 (직원) */
export async function decideCreditRequest(requestId: string, approve: boolean): Promise<Result<null>> {
  if (!id.safeParse(requestId).success) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { error } = await supabase.rpc('decide_credit_request', {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) return fail(toAppErrorCode(error));
  return ok(null);
}

/** 직원 직접 충전·차감. 바뀐 잔액을 돌려준다 */
export async function adjustCredits(values: AdjustCreditsValues): Promise<Result<{ balance: number }>> {
  const parsed = adjustCreditsSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('adjust_credits', {
    p_member_id: parsed.data.memberId,
    p_delta: parsed.data.mode === 'charge' ? parsed.data.amount : -parsed.data.amount,
    p_memo: parsed.data.memo || undefined,
  });
  if (error || typeof data !== 'number') return fail(toAppErrorCode(error));
  return ok({ balance: data });
}

/** 크레딧 1개 가격 (대표) */
export async function updateCreditPrice(values: CreditPriceValues): Promise<Result<null>> {
  const parsed = creditPriceSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('centers')
    .update({ credit_price: parsed.data.price }, { count: 'exact' })
    .eq('id', context.center.id);
  if (error) return fail(toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}
