'use server';

import { TZDate } from '@date-fns/tz';
import { z } from 'zod';

import { createHold } from '@/features/booking/rpc';
import { type CreateHoldInput } from '@/features/booking/schema';
import { staffActionContext } from '@/lib/auth/action-context';
import { publicEnv } from '@/lib/env';
import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

import {
  csvMemberSchema,
  type CsvMemberInput,
  grantPassSchema,
  type GrantPassValues,
  memberCreateSchema,
  memberFormSchema,
  type MemberFormInput,
} from './schema';

const id = z.uuid();

/** 회원 등록 (직원) — 이름 + 전화번호 + 개인정보 동의 확인만 필수 */
export async function createMember(values: MemberFormInput): Promise<Result<{ id: string }>> {
  const parsed = memberCreateSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('members')
    .insert({
      center_id: context.center.id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      birth: parsed.data.birth,
      gender: parsed.data.gender,
      tags: parsed.data.tags,
      memo: parsed.data.memo || null,
      privacy_agreed_at: now,
      marketing_agreed_at: parsed.data.marketingAgreed ? now : null,
      notify_enabled: parsed.data.notifyEnabled,
    })
    .select('id')
    .single();
  if (error) return fail(error.code === '23505' ? 'MEMBER_PHONE_EXISTS' : toAppErrorCode(error));
  return ok({ id: data.id });
}

/** 회원 정보 수정 (직원) */
export async function updateMember(memberId: string, values: MemberFormInput): Promise<Result<null>> {
  const parsed = memberFormSchema.safeParse(values);
  if (!parsed.success || !id.safeParse(memberId).success) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { data: current } = await supabase
    .from('members')
    .select('marketing_agreed_at')
    .eq('id', memberId)
    .maybeSingle();
  const { error, count } = await supabase
    .from('members')
    .update(
      {
        name: parsed.data.name,
        phone: parsed.data.phone,
        birth: parsed.data.birth,
        gender: parsed.data.gender,
        tags: parsed.data.tags,
        memo: parsed.data.memo || null,
        notify_enabled: parsed.data.notifyEnabled,
        // 동의 일시는 새로 동의할 때만 기록하고, 철회하면 비운다
        marketing_agreed_at: parsed.data.marketingAgreed
          ? (current?.marketing_agreed_at ?? new Date().toISOString())
          : null,
      },
      { count: 'exact' },
    )
    .eq('id', memberId)
    .eq('center_id', context.center.id);
  if (error) return fail(error.code === '23505' ? 'MEMBER_PHONE_EXISTS' : toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}

/** 메모만 저장 */
export async function updateMemberMemo(memberId: string, memo: string): Promise<Result<null>> {
  const parsed = z.string().trim().max(2000).safeParse(memo);
  if (!parsed.success || !id.safeParse(memberId).success) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('members')
    .update({ memo: parsed.data || null }, { count: 'exact' })
    .eq('id', memberId)
    .eq('center_id', context.center.id);
  if (error) return fail(toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}

/** 앱 초대 링크 만들기. send 면 알림톡(초대 링크) 발송 대기열에도 넣는다 */
export async function createMemberInvite(
  memberId: string,
  send: boolean,
): Promise<Result<{ url: string; expiresAt: string }>> {
  if (!id.safeParse(memberId).success) return fail('VALIDATION');
  const base = new URL('/invite/', publicEnv().NEXT_PUBLIC_SITE_URL).toString();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_member_invite', {
    p_member_id: memberId,
    p_invite_url_base: send ? base : undefined,
  });
  const parsed = z.object({ token: z.string(), expires_at: z.string() }).safeParse(data);
  if (error || !parsed.success) return fail(toAppErrorCode(error));
  return ok({ url: `${base}${parsed.data.token}`, expiresAt: parsed.data.expires_at });
}

/** 이용권 부여 */
export async function grantPass(values: GrantPassValues): Promise<Result<{ memberPassId: string }>> {
  const parsed = grantPassSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');
  // 결제일(날짜)은 센터 시간대의 정오로 기록
  const [year, month, day] = parsed.data.paidAt.split('-').map(Number) as [number, number, number];
  const paidAt = new TZDate(year, month - 1, day, 12, context.center.timezone);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('grant_member_pass', {
    p_member_id: parsed.data.memberId,
    p_product_id: parsed.data.productId,
    p_start_date: parsed.data.startDate,
    p_paid_amount: parsed.data.paidAmount,
    p_paid_at: paidAt.toISOString(),
    p_memo: parsed.data.memo || undefined,
  });
  const result = z.object({ member_pass_id: z.uuid() }).safeParse(data);
  if (error || !result.success) return fail(toAppErrorCode(error));
  return ok({ memberPassId: result.data.member_pass_id });
}

/** 이용권 정지 (정지 일수만큼 만료일 연장) */
export async function holdPass(values: CreateHoldInput) {
  const supabase = await createClient();
  return createHold(supabase, values);
}

/** 회원 삭제 요청 처리 (대표): 개인정보 마스킹 + 예약 통계만 보존 */
export async function withdrawMember(memberId: string): Promise<Result<null>> {
  if (!id.safeParse(memberId).success) return fail('VALIDATION');
  const supabase = await createClient();
  const { error } = await supabase.rpc('withdraw_member', { p_member_id: memberId });
  if (error) return fail(toAppErrorCode(error));
  return ok(null);
}

/** CSV 가져오기: 행마다 다시 검증하고, 같은 전화번호는 건너뛴다 */
export async function importMembers(
  rows: CsvMemberInput[],
): Promise<Result<{ inserted: number; skipped: string[] }>> {
  if (rows.length === 0 || rows.length > 2000) return fail('VALIDATION');
  const parsed = rows.map((row) => csvMemberSchema.safeParse(row));
  if (parsed.some((row) => !row.success)) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');
  const payload = parsed.map((row) => {
    const value = row.data!;
    return {
      name: value.name,
      phone: value.phone,
      birth: value.birth,
      gender: value.gender,
      memo: value.memo,
      tags: value.tags,
      joined_at: value.joinedAt,
    };
  });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('import_members', {
    p_center_id: context.center.id,
    p_rows: payload,
  });
  const result = z.object({ inserted: z.number(), skipped: z.array(z.string()) }).safeParse(data);
  if (error || !result.success) return fail(toAppErrorCode(error));
  return ok(result.data);
}
