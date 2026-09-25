import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { BrowserContext, Page } from '@playwright/test';

import type { Database } from '@/lib/supabase/database.types';

import { messages } from './messages';

/** 시드 계정 (supabase/seed.sql). 비밀번호는 모두 같다 */
export const PASSWORD = 'gymjjim1234!';
export const CENTER_ID = 'c0000000-0000-4000-8000-000000000001';
export const OWNER = { email: 'owner@gymjjim.test', name: '김대표' };
export const COACH = { email: 'coach.lee@gymjjim.test', name: '이코치' };
export const MEMBERS = {
  hong: { email: 'member1@gymjjim.test', id: 'd0000000-0000-4000-8000-000000000001', name: '홍길동' },
  kim: { email: 'member2@gymjjim.test', id: 'd0000000-0000-4000-8000-000000000002', name: '김민지' },
} as const;
export type SeedMember = (typeof MEMBERS)[keyof typeof MEMBERS];

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 가 없습니다. .env.local 에 로컬 Supabase 값을 넣어 주세요.`);
  return value;
}

const url = () => env('NEXT_PUBLIC_SUPABASE_URL');
const publishableKey = () => env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

/** 픽스처용 (RLS 우회). 테스트 코드에서만 쓴다 */
export function adminClient() {
  return createClient<Database>(url(), env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 회원으로 로그인한 API 클라이언트 (화면 밖에서 상대 회원의 행동을 흉내 낼 때) */
export async function memberClient(member: SeedMember) {
  const client = createClient<Database>(url(), publishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email: member.email, password: PASSWORD });
  if (error) throw error;
  return client;
}

/**
 * 브라우저에 로그인 쿠키를 심는다. 회원 화면은 카카오·매직링크만 있어서,
 * 앱과 같은 @supabase/ssr 로 비밀번호 로그인한 세션 쿠키를 그대로 넣는다.
 */
export async function signInBrowser(context: BrowserContext, baseURL: string, member: SeedMember) {
  const jar = new Map<string, string>();
  const client = createServerClient<Database>(url(), publishableKey(), {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const cookie of cookies) {
          if (cookie.value) jar.set(cookie.name, cookie.value);
          else jar.delete(cookie.name);
        }
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email: member.email, password: PASSWORD });
  if (error) throw error;
  const { hostname } = new URL(baseURL);
  await context.addCookies(
    [...jar].map(([name, value]) => ({ name, value, domain: hostname, path: '/', sameSite: 'Lax' as const })),
  );
}

/** 관리자(대표)는 화면에서 이메일·비밀번호로 로그인한다 */
export async function loginAsOwner(page: Page) {
  const t = messages.auth.adminLogin;
  await page.goto('/admin-login');
  await page.getByLabel(t.email).fill(OWNER.email);
  await page.getByLabel(t.password).fill(PASSWORD);
  await page.getByRole('button', { name: t.submit, exact: true }).click();
  await page.waitForURL(/\/admin(\?.*)?$/);
}
