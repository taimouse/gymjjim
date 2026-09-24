'use server';

import { z } from 'zod';

import { staffActionContext } from '@/lib/auth/action-context';
import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

import { saveProductInput, type SaveProductInput, toProductRow } from './schema';

/** 이용권 상품 생성·수정 (대표) */
export async function saveProduct(input: SaveProductInput): Promise<Result<{ id: string }>> {
  const parsed = saveProductInput.safeParse(input);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');

  const supabase = await createClient();
  const row = toProductRow(parsed.data.values);
  const query = parsed.data.id
    ? supabase.from('pass_products').update(row).eq('id', parsed.data.id).eq('center_id', context.center.id)
    : supabase.from('pass_products').insert({ ...row, center_id: context.center.id });
  const { data, error } = await query.select('id').maybeSingle();
  if (error) return fail(toAppErrorCode(error));
  return data ? ok({ id: data.id }) : fail('FORBIDDEN');
}

/** 판매중 on/off */
export async function setProductActive(id: string, isActive: boolean): Promise<Result<null>> {
  if (!z.uuid().safeParse(id).success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('pass_products')
    .update({ is_active: isActive }, { count: 'exact' })
    .eq('id', id)
    .eq('center_id', context.center.id);
  if (error) return fail(toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}

/** 상품 삭제(소프트) — 이미 판매한 이용권은 그대로 */
export async function deleteProduct(id: string): Promise<Result<null>> {
  if (!z.uuid().safeParse(id).success) return fail('VALIDATION');
  const context = await staffActionContext({ owner: true });
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('pass_products')
    .update({ deleted_at: new Date().toISOString(), is_active: false }, { count: 'exact' })
    .eq('id', id)
    .eq('center_id', context.center.id);
  if (error) return fail(toAppErrorCode(error));
  return count ? ok(null) : fail('FORBIDDEN');
}
