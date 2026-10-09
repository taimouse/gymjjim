'use server';

import { z } from 'zod';

import { staffActionContext } from '@/lib/auth/action-context';
import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import { sendStaffInvite } from './invite';
import {
  staffInviteSchema,
  type StaffInviteValues,
  staffUpdateSchema,
  type StaffUpdateValues,
} from './schema';

/**
 * 직원 초대 (대표)
 * 1) 직원 행 추가 (RLS: 대표만) 2) Supabase Auth 초대 메일 3) 가입 사용자와 연결
 * 이미 가입된 이메일이면 메일 없이 기존 계정과 연결한다 (existing: true).
 */
export async function inviteStaff(values: StaffInviteValues): Promise<Result<{ existing: boolean }>> {
  const parsed = staffInviteSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from('staff')
    .insert({
      center_id: context.center.id,
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      phone: parsed.data.phone || null,
      role: parsed.data.role,
      color: parsed.data.color,
    })
    .select('id')
    .single();
  if (error) return fail(error.code === '23505' ? 'STAFF_EMAIL_EXISTS' : toAppErrorCode(error));

  const invited = await sendStaffInvite({ id: row.id, email: parsed.data.email, name: parsed.data.name });
  if (!invited.ok) {
    if (invited.code === 'INVITE_FAILED') {
      await createAdminClient()
        .from('staff')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', row.id);
    }
    return fail(invited.code);
  }
  return ok({ existing: invited.existing });
}

/** 직원 이름·연락처·권한·색상 변경 (대표). 마지막 대표는 강등할 수 없다(DB 트리거). */
export async function updateStaff(values: StaffUpdateValues): Promise<Result<null>> {
  const parsed = staffUpdateSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('staff')
    .update(
      {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        role: parsed.data.role,
        color: parsed.data.color,
      },
      { count: 'exact' },
    )
    .eq('id', parsed.data.id)
    .eq('center_id', context.center.id);
  if (error) return fail(toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}

/** 직원 삭제(소프트) — 로그인할 수 없게 되고 담당 수업 기록은 남는다 */
export async function removeStaff(id: string): Promise<Result<null>> {
  if (!z.uuid().safeParse(id).success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('staff')
    .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', id)
    .eq('center_id', context.center.id);
  if (error) return fail(toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}
