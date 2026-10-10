/**
 * @/features/auth/actions 대신. 프로토타입에는 로그인이 없으므로
 * 로그아웃은 첫 화면으로, 첫 로그인 동의는 브라우저 DB 에 저장하고 회원 홈으로 보낸다.
 */
import { onboardingSchema, type OnboardingValues } from '@/features/auth/schema';
import { fail, type Result } from '@/lib/result';

import { withBase } from '../lib/base-path';
import { createClient } from './supabase-client';

function go(path: string) {
  window.location.assign(withBase(path));
}

export async function signOut(): Promise<void> {
  go('/');
}

export async function completeOnboarding(values: OnboardingValues): Promise<Result<never>> {
  const parsed = onboardingSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const client = createClient() as unknown as {
    rpc: (name: string, args: object) => Promise<{ error: { message: string } | null }>;
  };
  const { error } = await client.rpc('complete_onboarding', { p_marketing_agreed: parsed.data.marketing });
  if (error) return fail('UNKNOWN');
  go('/m/book/');
  return new Promise(() => undefined);
}

const unavailable = async (): Promise<Result<never>> => fail('UNKNOWN');
export const signInAdmin = unavailable;
export const sendMagicLink = unavailable;
export const setPassword = unavailable;
export async function signInWithKakao(): Promise<void> {}
