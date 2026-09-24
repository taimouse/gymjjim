import { createBrowserClient } from '@supabase/ssr';

import { publicEnv } from '@/lib/env';

import type { Database } from './database.types';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** 브라우저용 Supabase 클라이언트 (싱글턴). RLS 가 적용된 사용자 권한으로 동작한다. */
export function createClient() {
  const env = publicEnv();
  browserClient ??= createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return browserClient;
}
