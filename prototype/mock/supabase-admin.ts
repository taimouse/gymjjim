/** @/lib/supabase/admin 대신 (직원 초대 등 관리 API 는 흉내만 낸다) */
import { createClient } from './supabase-client';

export function createAdminClient() {
  return createClient();
}
