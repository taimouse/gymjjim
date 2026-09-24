import { TZDate } from '@date-fns/tz';

import { addDaysToKey, todayKey } from '@/lib/format';

import { adminClient, CENTER_ID, type SeedMember } from './supabase';

const TIME_ZONE = 'Asia/Seoul';

/** 센터 시간대 날짜·시각 → UTC ISO */
export function localToIso(dateKey: string, time: string): string {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  return new Date(new TZDate(year, month - 1, day, hour, minute, TIME_ZONE).getTime()).toISOString();
}

export const today = () => todayKey(TIME_ZONE);
export const tomorrow = () => addDaysToKey(today(), 1);

/** 시드 수업과 겹치지 않는 이른 아침 시각 (테스트마다 다르게) */
export function quietTime(): string {
  return `05:${String(10 + Math.floor(Math.random() * 40)).padStart(2, '0')}`;
}

/** 모든 이용권 상품으로 예약할 수 있는 테스트 전용 프로그램 */
export async function createProgram(label: string): Promise<{ id: string; name: string }> {
  const admin = adminClient();
  const name = `E2E ${label} ${Date.now().toString(36)}`;
  const { data: program, error } = await admin
    .from('programs')
    .insert({ center_id: CENTER_ID, name, default_capacity: 10, duration_min: 50, color: '#0ea5e9' })
    .select('id')
    .single();
  if (error) throw error;
  const { data: products, error: productError } = await admin
    .from('pass_products')
    .select('id')
    .eq('center_id', CENTER_ID)
    .is('deleted_at', null);
  if (productError) throw productError;
  const { error: allowError } = await admin
    .from('program_allowed_products')
    .insert(
      products.map((product) => ({ center_id: CENTER_ID, program_id: program.id, product_id: product.id })),
    );
  if (allowError) throw allowError;
  return { id: program.id, name };
}

export async function createSession(
  programId: string,
  options: { date: string; time: string; capacity: number },
): Promise<string> {
  const startsAt = localToIso(options.date, options.time);
  const { data, error } = await adminClient()
    .from('sessions')
    .insert({
      center_id: CENTER_ID,
      program_id: programId,
      starts_at: startsAt,
      ends_at: new Date(Date.parse(startsAt) + 50 * 60_000).toISOString(),
      capacity: options.capacity,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function sessionIdsOf(programId: string): Promise<string[]> {
  const { data, error } = await adminClient().from('sessions').select('id').eq('program_id', programId);
  if (error) throw error;
  return data.map((row) => row.id);
}

/** 회원을 바로 예약할 수 있는 상태로: 첫 로그인 동의 완료 + 넉넉한 1개월 자유이용권 */
export async function prepareMember(member: SeedMember): Promise<void> {
  const admin = adminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from('members')
    .update({ onboarded_at: now, notify_enabled: true })
    .eq('id', member.id);
  if (error) throw error;
  const { error: passError } = await admin.from('member_passes').insert({
    center_id: CENTER_ID,
    member_id: member.id,
    product_id: 'e0000000-0000-4000-8000-000000000001',
    name: '1개월 자유이용권',
    type: 'period',
    start_date: today(),
    end_date: addDaysToKey(today(), 29),
  });
  if (passError) throw passError;
}

/** 테스트가 만든 프로그램·수업을 숨긴다 (soft delete) */
export async function cleanupProgram(programId: string): Promise<void> {
  const admin = adminClient();
  const deletedAt = new Date().toISOString();
  await admin.from('sessions').update({ deleted_at: deletedAt }).eq('program_id', programId);
  await admin.from('programs').update({ deleted_at: deletedAt }).eq('id', programId);
}
