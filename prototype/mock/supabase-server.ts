/** @/lib/supabase/server 대신: 서버 액션도 브라우저 DB 를 쓴다 */
import { createClient as browserClient } from './supabase-client';

export async function createClient() {
  return browserClient();
}

export type ServerClient = Awaited<ReturnType<typeof createClient>>;
