// 도커 없는 로컬 개발 스택 설정. Supabase 로컬(supabase start)과 같은 포트·키 체계를 따른다.
import path from 'node:path';

import { signJwt } from './jwt.mts';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const CACHE_DIR = path.join(ROOT, '.cache');

export const PORTS = {
  /** Supabase API 와 같은 자리: /auth/v1 · /rest/v1 · /realtime/v1 */
  gateway: 54321,
  database: 54322,
  postgrest: 54330,
  postgrestAdmin: 54331,
  next: 3000,
} as const;

export const API_URL = `http://127.0.0.1:${PORTS.gateway}`;
export const SITE_URL = `http://localhost:${PORTS.next}`;
export const DATABASE = 'gymjjim';

/** Supabase 로컬 개발 기본 비밀값 (개발 전용. 운영에서는 절대 쓰지 않는다) */
export const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

// supabase start 가 주는 데모 키와 같은 형태 (iss: supabase-demo, 2032년 만료)
const DEMO_EXP = 1983812996;
export const ANON_KEY = signJwt({ iss: 'supabase-demo', role: 'anon', exp: DEMO_EXP }, JWT_SECRET);
export const SERVICE_ROLE_KEY = signJwt(
  { iss: 'supabase-demo', role: 'service_role', exp: DEMO_EXP },
  JWT_SECRET,
);

/** 개발용 메일함 (매직링크·직원 초대 메일) */
export const MAILBOX_URL = `${API_URL}/_dev/mail`;

/** 앱(next dev)과 E2E 가 쓸 환경 변수 */
export function appEnv(): Record<string, string> {
  return {
    NEXT_PUBLIC_SITE_URL: SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY,
    SUPABASE_SECRET_KEY: SERVICE_ROLE_KEY,
  };
}

export const ENV_FILE = path.join(CACHE_DIR, 'dev-stack.env');
