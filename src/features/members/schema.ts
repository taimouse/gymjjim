import { z } from 'zod';

import { isMobilePhone, normalizePhone } from '@/lib/format';

export const mobilePhone = z
  .string()
  .trim()
  .transform((value) => normalizePhone(value))
  .refine((value) => isMobilePhone(value), { error: 'mobilePhone' });

const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value), { error: 'invalid' })
  .transform((value) => value || null);

/** 쉼표로 구분한 태그 입력 → 배열 */
export const tagsInput = z.string().transform((value) =>
  Array.from(
    new Set(
      value
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20),
);

export const memberFormSchema = z.object({
  name: z.string().trim().min(1, { error: 'required' }).max(50, { error: 'max' }),
  phone: mobilePhone,
  birth: optionalDate,
  gender: z.enum(['male', 'female', 'other']).nullable(),
  tags: tagsInput,
  memo: z.string().trim().max(2000, { error: 'max' }),
  privacyAgreed: z.boolean(),
  marketingAgreed: z.boolean(),
  notifyEnabled: z.boolean(),
});
export type MemberFormInput = z.input<typeof memberFormSchema>;
export type MemberFormOutput = z.output<typeof memberFormSchema>;

/** 신규 등록은 개인정보 수집·이용 동의(현장 확인) 필수 */
export const memberCreateSchema = memberFormSchema.refine((values) => values.privacyAgreed, {
  path: ['privacyAgreed'],
  error: 'privacyRequired',
});

export const EMPTY_MEMBER: MemberFormInput = {
  name: '',
  phone: '',
  birth: '',
  gender: null,
  tags: '',
  memo: '',
  privacyAgreed: false,
  marketingAgreed: false,
  notifyEnabled: true,
};

export const grantPassSchema = z.object({
  memberId: z.uuid(),
  productId: z.uuid({ error: 'required' }),
  startDate: z.iso.date({ error: 'required' }),
  paidAmount: z
    .number({ error: 'required' })
    .int()
    .min(0, { error: 'min' })
    .max(100_000_000, { error: 'max' }),
  paidAt: z.iso.date({ error: 'required' }),
  memo: z.string().trim().max(1000, { error: 'max' }),
});
export type GrantPassValues = z.infer<typeof grantPassSchema>;

/** 회원 본인 알림 설정 (회원 앱 > 내 정보) */
export const mySettingsSchema = z.object({
  centerId: z.uuid(),
  notifyEnabled: z.boolean(),
  marketingAgreed: z.boolean(),
});
export type MySettingsInput = z.infer<typeof mySettingsSchema>;

export const MEMBER_FILTERS = ['all', 'active', 'expiring', 'low', 'expired', 'hold', 'none'] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];
export const MEMBER_SORTS = ['name', 'recent', 'expiry'] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

/** CSV 한 줄 (가져오기 미리보기·서버 재검증 공용) */
export const csvMemberSchema = z.object({
  name: z.string().trim().min(1, { error: 'required' }).max(50, { error: 'max' }),
  phone: mobilePhone,
  birth: optionalDate,
  gender: z
    .string()
    .trim()
    .transform((value) => {
      const normalized = value.toLowerCase();
      if (['남', '남자', '남성', 'm', 'male'].includes(normalized)) return 'male' as const;
      if (['여', '여자', '여성', 'f', 'female'].includes(normalized)) return 'female' as const;
      return null;
    }),
  memo: z.string().trim().max(2000, { error: 'max' }),
  tags: tagsInput,
  joinedAt: optionalDate,
});
export type CsvMemberInput = z.input<typeof csvMemberSchema>;
export type CsvMemberOutput = z.output<typeof csvMemberSchema>;
