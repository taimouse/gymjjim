import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { publicEnv } from '@/lib/env';
import { serverEnv } from '@/lib/env.server';

import type { Database } from './database.types';

/**
 * 비밀 키(service role) 클라이언트. RLS 를 우회하므로
 * 직원 초대처럼 Auth 관리 API 가 꼭 필요한 곳에서만, 권한 확인을 마친 뒤에 쓴다.
 */
export function createAdminClient() {
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
