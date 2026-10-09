'use server';

import { z } from 'zod';

import { sendStaffInvite } from '@/features/staff/invite';
import { platformActionContext } from '@/lib/auth/action-context';
import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

import {
  centerCreateSchema,
  type CenterCreateValues,
  type CenterStatus,
  centerUpdateSchema,
  type CenterUpdateValues,
  type InvoiceStatus,
  invoiceStatusSchema,
  type InvoiceStatusValues,
  monthSchema,
  planSchema,
  type PlanValues,
} from './schema';

/**
 * 운영자 서버 액션. 액션마다 운영자인지 먼저 확인하고(proxy 를 거치지 않을 수 있다),
 * 실제 변경은 운영자 전용 RPC·RLS 가 한 번 더 검증한다.
 */

export type OwnerInviteOutcome = 'sent' | 'existing' | 'failed';

/** 새 센터 + 대표 초대. 초대 메일이 실패해도 센터는 남기고 상세에서 다시 보낼 수 있게 한다 */
export async function createCenter(
  values: CenterCreateValues,
): Promise<Result<{ centerId: string; invite: OwnerInviteOutcome }>> {
  const parsed = centerCreateSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  if (!(await platformActionContext())) return fail('FORBIDDEN');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_create_center', {
    p_name: parsed.data.name,
    p_plan_id: parsed.data.planId,
    p_status: parsed.data.status,
    p_owner_name: parsed.data.ownerName,
    p_owner_email: parsed.data.ownerEmail,
    p_phone: parsed.data.phone || undefined,
    p_address: parsed.data.address || undefined,
    p_trial_ends_at: parsed.data.trialEndsAt || undefined,
  });
  if (error) return fail(toAppErrorCode(error));
  const created = z.object({ center_id: z.uuid(), staff_id: z.uuid() }).parse(data);

  const invited = await sendStaffInvite({
    id: created.staff_id,
    email: parsed.data.ownerEmail.toLowerCase(),
    name: parsed.data.ownerName,
  });
  return ok({
    centerId: created.center_id,
    invite: invited.ok ? (invited.existing ? 'existing' : 'sent') : 'failed',
  });
}

/** 요금제·상태·체험 종료일·운영 메모 변경 */
export async function updateCenter(
  values: CenterUpdateValues,
): Promise<Result<{ previousStatus: CenterStatus }>> {
  const parsed = centerUpdateSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  if (!(await platformActionContext())) return fail('FORBIDDEN');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_update_center', {
    p_center_id: parsed.data.id,
    p_plan_id: parsed.data.planId,
    p_status: parsed.data.status,
    p_trial_ends_at: parsed.data.trialEndsAt || undefined,
    p_memo: parsed.data.memo,
  });
  if (error) return fail(toAppErrorCode(error));
  const result = z
    .object({ previous_status: z.enum(['trial', 'active', 'suspended', 'closed']) })
    .parse(data);
  return ok({ previousStatus: result.previous_status });
}

/** 아직 계정과 연결되지 않은 대표에게 초대 메일을 다시 보낸다 */
export async function resendOwnerInvite(centerId: string): Promise<Result<{ existing: boolean }>> {
  if (!z.uuid().safeParse(centerId).success) return fail('VALIDATION');
  if (!(await platformActionContext())) return fail('FORBIDDEN');

  // 운영자는 직원 테이블을 직접 읽지 않으므로, 권한 확인 뒤 service role 로 대표 행을 찾는다
  const { data: owner, error } = await createAdminClient()
    .from('staff')
    .select('id, name, email, user_id')
    .eq('center_id', centerId)
    .eq('role', 'owner')
    .is('deleted_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) return fail(toAppErrorCode(error));
  if (!owner?.email) return fail('CENTER_NOT_FOUND');
  if (owner.user_id) return fail('INVITE_USED');

  const invited = await sendStaffInvite({ id: owner.id, email: owner.email, name: owner.name });
  return invited.ok ? ok({ existing: invited.existing }) : fail(invited.code);
}

/** 요금제 추가·수정 (삭제 대신 판매 중지) */
export async function savePlan(values: PlanValues): Promise<Result<null>> {
  const parsed = planSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  if (!(await platformActionContext())) return fail('FORBIDDEN');

  const row = {
    code: parsed.data.code,
    name: parsed.data.name,
    monthly_price: parsed.data.monthlyPrice,
    max_members: parsed.data.maxMembers,
    max_staff: parsed.data.maxStaff,
    is_active: parsed.data.isActive,
    sort_order: parsed.data.sortOrder,
  };
  const supabase = await createClient();
  const { error, count } = parsed.data.id
    ? await supabase.from('plans').update(row, { count: 'exact' }).eq('id', parsed.data.id)
    : await supabase.from('plans').insert(row, { count: 'exact' });
  if (error) return fail(error.code === '23505' ? 'PLAN_CODE_EXISTS' : toAppErrorCode(error));
  return count ? ok(null) : fail('PLAN_NOT_FOUND');
}

/** 그 달 청구서 일괄 발행 → 새로 만든 장 수 */
export async function issueMonthlyInvoices(month: string): Promise<Result<{ count: number }>> {
  if (!monthSchema.safeParse(month).success) return fail('VALIDATION');
  if (!(await platformActionContext())) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_issue_monthly_invoices', { p_month: month });
  if (error) return fail(toAppErrorCode(error));
  return ok({ count: data });
}

/** 입금 · 미납으로 되돌리기 · 취소. 이전 상태를 돌려줘서 "되돌리기" 토스트를 만들 수 있다 */
export async function setInvoiceStatus(
  values: InvoiceStatusValues,
): Promise<Result<{ previousStatus: InvoiceStatus; previousPaidAt: string | null }>> {
  const parsed = invoiceStatusSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  if (!(await platformActionContext())) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('platform_set_invoice_status', {
    p_invoice_id: parsed.data.id,
    p_status: parsed.data.status,
    p_paid_at: parsed.data.paidAt ?? undefined,
  });
  if (error) return fail(toAppErrorCode(error));
  const result = z
    .object({
      previous_status: z.enum(['pending', 'paid', 'void']),
      previous_paid_at: z.string().nullable(),
    })
    .parse(data);
  return ok({ previousStatus: result.previous_status, previousPaidAt: result.previous_paid_at });
}
