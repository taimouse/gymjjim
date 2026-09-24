import 'server-only';

import { z } from 'zod';

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

let cached: z.infer<typeof serverEnvSchema> | undefined;

/** 서버 전용 비밀 값. 클라이언트 번들에 들어가지 않도록 server-only 로 막는다. */
export function serverEnv() {
  cached ??= serverEnvSchema.parse({ SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY });
  return cached;
}
