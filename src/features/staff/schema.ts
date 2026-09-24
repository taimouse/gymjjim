import { z } from 'zod';

import { isMobilePhone, normalizePhone } from '@/lib/format';

/** 강사 구분용 캘린더 색 (이벤트 왼쪽 테두리) — 진한 톤 */
export const STAFF_COLORS = [
  '#4F46E5',
  '#0EA5E9',
  '#F97316',
  '#10B981',
  '#E11D48',
  '#8B5CF6',
  '#CA8A04',
  '#0D9488',
  '#DB2777',
  '#475569',
] as const;

const optionalPhone = z
  .string()
  .trim()
  .transform((value) => normalizePhone(value))
  .refine((value) => value === '' || isMobilePhone(value), { error: 'mobilePhone' });

export const staffInviteSchema = z.object({
  name: z.string().trim().min(1, { error: 'required' }).max(50, { error: 'max' }),
  email: z.email({ error: 'email' }),
  phone: optionalPhone,
  role: z.enum(['owner', 'staff']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: 'color' }),
});
export type StaffInviteValues = z.input<typeof staffInviteSchema>;

export const staffUpdateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1, { error: 'required' }).max(50, { error: 'max' }),
  phone: optionalPhone,
  role: z.enum(['owner', 'staff']),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: 'color' }),
});
export type StaffUpdateValues = z.input<typeof staffUpdateSchema>;
