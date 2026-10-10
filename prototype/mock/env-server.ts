/** @/lib/env.server 대신 (프로토타입에는 서버 비밀값이 없다) */
export function serverEnv() {
  return { SUPABASE_SECRET_KEY: 'prototype' };
}
