import { z } from 'zod';

/**
 * 인증 폼 스키마 (서버 액션과 화면 폼이 공유).
 * 에러 메시지는 i18n 키(validation.<key>)로 두고 화면에서 번역한다.
 */

export const adminLoginSchema = z.object({
  email: z.email({ error: 'email' }),
  password: z.string({ error: 'required' }).min(1, { error: 'required' }).max(72),
  next: z.string().optional(),
});
export type AdminLoginValues = z.infer<typeof adminLoginSchema>;

export const magicLinkSchema = z.object({
  email: z.email({ error: 'email' }),
  next: z.string().optional(),
});
export type MagicLinkValues = z.infer<typeof magicLinkSchema>;

export const onboardingSchema = z.object({
  privacy: z.boolean().refine((value) => value, { error: 'privacyRequired' }),
  marketing: z.boolean(),
});
export type OnboardingValues = z.infer<typeof onboardingSchema>;

/** get_invite RPC 결과 */
export const inviteInfoSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('invalid') }),
  z.object({
    status: z.enum(['valid', 'expired', 'used']),
    center_name: z.string(),
    member_name: z.string(),
  }),
]);
export type InviteInfo = z.infer<typeof inviteInfoSchema>;

export const setPasswordSchema = z
  .object({
    password: z.string().min(8, { error: 'passwordMin' }).max(72, { error: 'passwordMax' }),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, { path: ['confirm'], error: 'passwordMismatch' });
export type SetPasswordValues = z.infer<typeof setPasswordSchema>;
