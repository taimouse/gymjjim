import 'server-only';

import { publicEnv } from '@/lib/env';
import { type AppErrorCode, toAppErrorCode } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';

export type StaffInviteResult = { ok: true; existing: boolean } | { ok: false; code: AppErrorCode };

/**
 * 이미 만들어 둔 직원 행에 초대 메일을 보내고 가입 계정과 연결한다 (service role).
 * 이미 가입된 이메일이면 메일 없이 기존 계정과 연결한다 (existing: true).
 * 호출하는 쪽이 권한 확인(대표·운영자)을 마친 뒤에만 부른다.
 */
export async function sendStaffInvite(staff: {
  id: string;
  email: string;
  name: string;
}): Promise<StaffInviteResult> {
  const admin = createAdminClient();
  const redirectTo = new URL(
    '/auth/confirm?next=/admin/set-password',
    publicEnv().NEXT_PUBLIC_SITE_URL,
  ).toString();
  const invited = await admin.auth.admin.inviteUserByEmail(staff.email, {
    redirectTo,
    data: { name: staff.name },
  });

  let userId = invited.data.user?.id ?? null;
  const existing = !userId;
  if (!userId) {
    const { data } = await admin.rpc('admin_find_user_id_by_email', { p_email: staff.email });
    userId = data ?? null;
  }
  if (!userId) return { ok: false, code: 'INVITE_FAILED' };

  const { error } = await admin
    .from('staff')
    .update({ user_id: userId, invited_at: new Date().toISOString() })
    .eq('id', staff.id);
  if (error)
    return { ok: false, code: error.code === '23505' ? 'STAFF_EMAIL_EXISTS' : toAppErrorCode(error) };
  return { ok: true, existing };
}
