'use server';

import { redirect } from 'next/navigation';

import { publicEnv } from '@/lib/env';
import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { safeNext } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

import {
  adminLoginSchema,
  type AdminLoginValues,
  magicLinkSchema,
  type MagicLinkValues,
  onboardingSchema,
  type OnboardingValues,
  setPasswordSchema,
  type SetPasswordValues,
} from './schema';

function siteUrl(path: string): string {
  return new URL(path, publicEnv().NEXT_PUBLIC_SITE_URL).toString();
}

/** 관리자(대표·트레이너) 이메일 + 비밀번호 로그인 */
export async function signInAdmin(values: AdminLoginValues): Promise<Result<never>> {
  const parsed = adminLoginSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return fail(error.status === 429 ? 'RATE_LIMITED' : 'INVALID_CREDENTIALS');
  redirect(safeNext(parsed.data.next, '/admin'));
}

/** 회원 카카오 로그인 (Supabase Kakao provider). 카카오 동의 화면으로 이동한다. */
export async function signInWithKakao(formData: FormData): Promise<void> {
  const next = safeNext(formData.get('next'), '/m');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`) },
  });
  if (error || !data.url) redirect(`/login?error=KAKAO_UNAVAILABLE&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}

/** 회원 이메일 매직링크 (보조 로그인) */
export async function sendMagicLink(values: MagicLinkValues): Promise<Result<{ email: string }>> {
  const parsed = magicLinkSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const next = safeNext(parsed.data.next, '/m');
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      // 메일 템플릿이 이 주소 뒤에 &token_hash=…&type=email 을 붙인다 (supabase/templates/magic_link.html)
      emailRedirectTo: siteUrl(`/auth/confirm?next=${encodeURIComponent(next)}`),
    },
  });
  if (error) return fail(error.status === 429 ? 'RATE_LIMITED' : toAppErrorCode(error));
  return ok({ email: parsed.data.email });
}

/** 첫 로그인 동의 저장 후 회원 홈으로 */
export async function completeOnboarding(values: OnboardingValues): Promise<Result<never>> {
  const parsed = onboardingSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const supabase = await createClient();
  const { error } = await supabase.rpc('complete_onboarding', { p_marketing_agreed: parsed.data.marketing });
  if (error) return fail(toAppErrorCode(error));
  redirect('/m');
}

/** 초대받은 직원의 첫 비밀번호 설정 */
export async function setPassword(values: SetPasswordValues): Promise<Result<never>> {
  const parsed = setPasswordSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(error.code === 'weak_password' ? 'WEAK_PASSWORD' : toAppErrorCode(error));
  redirect('/admin');
}

export async function signOut(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(formData.get('to') === 'admin' ? '/admin-login' : '/login');
}
