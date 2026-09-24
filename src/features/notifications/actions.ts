'use server';

import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

import { pushEndpointSchema, type PushSubscriptionInput, pushSubscriptionSchema } from './schema';

/** 이 기기로 푸시 받기 (회원 본인) */
export async function savePushSubscription(input: PushSubscriptionInput): Promise<Result<null>> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return fail('VALIDATION');
  const supabase = await createClient();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_center_id: parsed.data.centerId,
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
    p_user_agent: parsed.data.userAgent,
  });
  return error ? fail(toAppErrorCode(error)) : ok(null);
}

/** 이 기기 푸시 끄기 (회원 본인 구독만 지워진다) */
export async function deletePushSubscription(endpoint: string): Promise<Result<null>> {
  const parsed = pushEndpointSchema.safeParse(endpoint);
  if (!parsed.success) return fail('VALIDATION');
  const supabase = await createClient();
  const { error } = await supabase.rpc('delete_push_subscription', { p_endpoint: parsed.data });
  return error ? fail(toAppErrorCode(error)) : ok(null);
}
