'use server';

import { z } from 'zod';

import { localToUtc } from '@/features/sessions/recurrence';
import { staffActionContext } from '@/lib/auth/action-context';
import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

import { saveProgramInput, type SaveProgramInput } from './schema';

/** 프로그램 생성·수정 (대표). 사용 가능한 이용권까지 한 트랜잭션으로 저장 */
export async function saveProgram(input: SaveProgramInput): Promise<Result<{ id: string }>> {
  const parsed = saveProgramInput.safeParse(input);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');

  const { id, values } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_program', {
    p_id: id,
    p_center_id: context.center.id,
    p_name: values.name,
    p_type: values.type,
    p_default_capacity: values.defaultCapacity,
    p_duration_min: values.durationMin,
    p_color: values.color,
    p_default_instructor_id: values.defaultInstructorId ?? undefined,
    p_description: values.description,
    p_allowed_product_ids: values.usePass ? values.allowedProductIds : [],
    p_credit_cost: values.useCredit ? (values.creditCost ?? undefined) : undefined,
    p_publish_at: values.publishAt
      ? localToUtc(values.publishAt.slice(0, 10), values.publishAt.slice(11), context.center.timezone)
      : undefined,
  });
  if (error || !data) return fail(toAppErrorCode(error));
  return ok({ id: data });
}

/** 프로그램 삭제(소프트) — 기존 수업·예약 기록은 남는다 */
export async function deleteProgram(id: string): Promise<Result<null>> {
  if (!z.uuid().safeParse(id).success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('programs')
    .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', id)
    .eq('center_id', context.center.id);
  if (error) return fail(toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}
