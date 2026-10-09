import { z } from 'zod';

import { publicEnv } from '@/lib/env';

import { type Area, canEnter, parseRoleClaims } from './roles';

/**
 * 로컬 개발 스택(pnpm dev:local) 전용 "로그인 없이 보기".
 * 개발 스택 게이트웨이의 POST /_dev/session 이 비밀번호 없이 시드 계정 세션을 만들어 준다
 * (실제 Supabase 에는 없는 API). 운영 빌드이거나 GYMJJIM_DEV_LOGIN=1 이 없으면 항상 꺼진다.
 */
export const DEV_ACCOUNTS = ['owner', 'staff', 'member', 'platform'] as const;
export type DevAccount = (typeof DEV_ACCOUNTS)[number];

/** 로그인 없이 만든 세션의 JWT amr 방식 (scripts/dev-stack/config.mts 와 맞춘다) */
const DEV_LOGIN_METHOD = 'dev';

export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.GYMJJIM_DEV_LOGIN === '1';
}

export function isDevAccount(value: unknown): value is DevAccount {
  return typeof value === 'string' && (DEV_ACCOUNTS as readonly string[]).includes(value);
}

const amrSchema = z.array(z.object({ method: z.string() }));

interface Claims {
  app_metadata?: unknown;
  amr?: unknown;
}

function isDevSession(claims: Claims): boolean {
  const amr = amrSchema.safeParse(claims.amr);
  return amr.success && amr.data.some((entry) => entry.method === DEV_LOGIN_METHOD);
}

/**
 * 이 요청에서 들어갈 개발용 계정. null 이면 평소대로 처리한다.
 *  - ?as=owner|staff|member → 그 계정으로 바꾼다
 *  - 로그인 전 → 관리자·첫 화면은 대표, 회원 화면은 회원, 운영자 화면은 운영자
 *  - 로그인 없이 들어온 세션이 권한 없는 화면에 가면 → 맞는 계정으로 바꾼다 (/admin ↔ /m ↔ /platform)
 *    직접 로그인한 세션은 운영과 똑같이 403 을 본다
 */
export function pickDevAccount(
  area: Exclude<Area, 'public'>,
  requested: string | null,
  claims: Claims | null,
): DevAccount | null {
  if (isDevAccount(requested)) return requested;
  const fallback: DevAccount = area === 'member' ? 'member' : area === 'platform' ? 'platform' : 'owner';
  if (!claims) return fallback;
  const denied = canEnter(area, parseRoleClaims(claims.app_metadata)) === false;
  return denied && isDevSession(claims) ? fallback : null;
}

const sessionSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
});

interface AuthClient {
  auth: { setSession(session: z.infer<typeof sessionSchema>): Promise<{ error: unknown }> };
}

/** 시드 계정 세션을 받아 쿠키에 심는다. 꺼져 있거나 실패하면 false (평소대로 로그인 화면) */
export async function devSignIn(supabase: AuthClient, account: DevAccount): Promise<boolean> {
  if (!devLoginEnabled()) return false;
  try {
    const response = await fetch(`${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/_dev/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ as: account }),
      cache: 'no-store',
    });
    if (!response.ok) return false;
    const session = sessionSchema.safeParse(await response.json());
    if (!session.success) return false;
    const { error } = await supabase.auth.setSession(session.data);
    return !error;
  } catch {
    return false;
  }
}
