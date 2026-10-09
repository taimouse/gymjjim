import { z } from 'zod';

import { normalizePhone } from '@/lib/format';

/** 운영자 콘솔 폼 스키마 (서버 액션·클라이언트 공용) */

export const CENTER_STATUSES = ['trial', 'active', 'suspended', 'closed'] as const;
export type CenterStatus = (typeof CENTER_STATUSES)[number];

export const INVOICE_STATUSES = ['pending', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const dateKey = z.iso.date({ error: 'invalid' });

const optionalLandline = z
  .string()
  .trim()
  .transform((value) => normalizePhone(value))
  .refine((value) => value === '' || /^[0-9]{8,11}$/.test(value), { error: 'phone' });

/** 한도 입력: 비우면 무제한(null) */
const optionalLimit = (max: number) =>
  z
    .number({ error: 'invalid' })
    .int({ error: 'invalid' })
    .min(1, { error: 'min' })
    .max(max, { error: 'max' })
    .nullable();

/** 체험이면 체험 종료일이 필요하다 */
function requireTrialEnd(value: { status: CenterStatus; trialEndsAt: string }, ctx: z.RefinementCtx) {
  if (value.status === 'trial' && !value.trialEndsAt) {
    ctx.addIssue({ code: 'custom', path: ['trialEndsAt'], message: 'required' });
  }
}

export const centerCreateSchema = z
  .object({
    name: z.string().trim().min(1, { error: 'required' }).max(100, { error: 'max' }),
    phone: optionalLandline,
    address: z.string().trim().max(200, { error: 'max' }),
    planId: z.uuid({ error: 'required' }),
    status: z.enum(['trial', 'active']),
    trialEndsAt: z.union([z.literal(''), dateKey]),
    ownerName: z.string().trim().min(1, { error: 'required' }).max(50, { error: 'max' }),
    ownerEmail: z.email({ error: 'email' }),
  })
  .superRefine(requireTrialEnd);
export type CenterCreateValues = z.input<typeof centerCreateSchema>;

export const centerUpdateSchema = z
  .object({
    id: z.uuid(),
    planId: z.uuid({ error: 'required' }),
    status: z.enum(CENTER_STATUSES),
    trialEndsAt: z.union([z.literal(''), dateKey]),
    memo: z.string().max(2000, { error: 'max' }),
  })
  .superRefine(requireTrialEnd);
export type CenterUpdateValues = z.input<typeof centerUpdateSchema>;

export const planSchema = z.object({
  id: z.uuid().nullable(),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{2,30}$/, { error: 'planCode' }),
  name: z.string().trim().min(1, { error: 'required' }).max(50, { error: 'max' }),
  monthlyPrice: z
    .number({ error: 'required' })
    .int({ error: 'invalid' })
    .min(0, { error: 'min' })
    .max(100_000_000, { error: 'max' }),
  maxMembers: optionalLimit(1_000_000),
  maxStaff: optionalLimit(10_000),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
});
export type PlanValues = z.input<typeof planSchema>;

/** 청구 월 (그 달 1일) */
export const monthSchema = dateKey.refine((value) => value.endsWith('-01'), { error: 'invalid' });

export const invoiceStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(INVOICE_STATUSES),
  paidAt: z.iso.datetime({ offset: true }).nullable(),
});
export type InvoiceStatusValues = z.input<typeof invoiceStatusSchema>;
