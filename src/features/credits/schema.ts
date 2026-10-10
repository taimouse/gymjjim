import { z } from 'zod';

/** 크레딧: 회원 지갑. 충전 요청 · 직원 충전/차감 · 크레딧 1개 가격 */

/** 한 번에 충전·차감할 수 있는 최대 크레딧 */
export const CREDIT_MAX = 1000;

/** 충전 요청 금액 바로 고르기 */
export const CHARGE_PRESETS = [10, 20, 50] as const;

const amount = z
  .number({ error: 'required' })
  .int({ error: 'invalid' })
  .min(1, { error: 'min' })
  .max(CREDIT_MAX, { error: 'max' });

/** 충전 요청 (회원) */
export const chargeRequestSchema = z.object({
  centerId: z.uuid(),
  amount,
});
export type ChargeRequestValues = z.infer<typeof chargeRequestSchema>;

/** 직원 직접 충전·차감 */
export const adjustCreditsSchema = z.object({
  memberId: z.uuid(),
  mode: z.enum(['charge', 'deduct']),
  amount,
  memo: z.string().trim().max(200, { error: 'max' }),
});
export type AdjustCreditsValues = z.infer<typeof adjustCreditsSchema>;

/** 크레딧 1개 가격 (설정) */
export const creditPriceSchema = z.object({
  price: z
    .number({ error: 'required' })
    .int({ error: 'invalid' })
    .min(0, { error: 'min' })
    .max(1_000_000, { error: 'max' }),
});
export type CreditPriceValues = z.infer<typeof creditPriceSchema>;

/** my_credits RPC 결과 */
export const myCreditsSchema = z.object({
  balance: z.number().int(),
  price: z.number().int(),
  pending: z
    .object({
      id: z.uuid(),
      amount: z.number().int(),
      unit_price: z.number().int(),
      created_at: z.string(),
    })
    .nullable(),
});
export type MyCredits = z.infer<typeof myCreditsSchema>;
