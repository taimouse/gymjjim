import { z } from 'zod';

import type { TablesInsert } from '@/lib/supabase/database.types';

export const PASS_TYPES = ['period', 'count', 'period_count'] as const;
export type PassType = (typeof PASS_TYPES)[number];

/** 이용권 상품 폼. 유형에 따라 기간·횟수 중 필요한 값만 검사한다. */
export const productFormSchema = z
  .object({
    type: z.enum(PASS_TYPES),
    name: z.string().trim().min(1, { error: 'required' }).max(100, { error: 'max' }),
    durationDays: z
      .number()
      .int({ error: 'invalid' })
      .min(1, { error: 'min' })
      .max(3650, { error: 'max' })
      .nullable(),
    totalCount: z
      .number()
      .int({ error: 'invalid' })
      .min(1, { error: 'min' })
      .max(1000, { error: 'max' })
      .nullable(),
    useLimit: z.boolean(),
    limitCount: z
      .number()
      .int({ error: 'invalid' })
      .min(1, { error: 'min' })
      .max(100, { error: 'max' })
      .nullable(),
    limitUnit: z.enum(['week', 'month']),
    price: z.number({ error: 'required' }).int().min(0, { error: 'min' }).max(100_000_000, { error: 'max' }),
    isActive: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.type !== 'count' && values.durationDays === null) {
      ctx.addIssue({ code: 'custom', path: ['durationDays'], message: 'required' });
    }
    if (values.type !== 'period' && values.totalCount === null) {
      ctx.addIssue({ code: 'custom', path: ['totalCount'], message: 'required' });
    }
    if (values.useLimit && values.limitCount === null) {
      ctx.addIssue({ code: 'custom', path: ['limitCount'], message: 'required' });
    }
  });
export type ProductFormValues = z.infer<typeof productFormSchema>;

export const saveProductInput = z.object({ id: z.uuid().optional(), values: productFormSchema });
export type SaveProductInput = z.infer<typeof saveProductInput>;

export const EMPTY_PRODUCT: ProductFormValues = {
  type: 'period',
  name: '',
  durationDays: 30,
  totalCount: null,
  useLimit: false,
  limitCount: 3,
  limitUnit: 'week',
  price: 0,
  isActive: true,
};

/** 폼 값 → DB 행. 유형에 맞지 않는 값은 비운다 (DB 제약과 동일) */
export function toProductRow(
  values: ProductFormValues,
): Omit<TablesInsert<'pass_products'>, 'center_id' | 'id'> {
  return {
    type: values.type,
    name: values.name,
    duration_days: values.type === 'count' ? null : values.durationDays,
    total_count: values.type === 'period' ? null : values.totalCount,
    period_limit_count: values.useLimit ? values.limitCount : null,
    period_limit_unit: values.useLimit ? values.limitUnit : null,
    price: values.price,
    is_active: values.isActive,
  };
}
