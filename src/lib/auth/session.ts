import 'server-only';

import { redirect } from 'next/navigation';
import { cache } from 'react';

import type { Tables } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/server';

/**
 * 서버 컴포넌트·서버 액션용 인증 헬퍼. 요청마다 한 번만 조회하도록 React cache 로 감싼다.
 * 역할 판단은 JWT 클레임이 아니라 DB(RLS 적용) 기준이다.
 */

export const getClaims = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ?? null;
});

export type CenterInfo = Pick<Tables<'centers'>, 'id' | 'name' | 'timezone' | 'booking_settings'>;
export type StaffInfo = Pick<Tables<'staff'>, 'id' | 'name' | 'role' | 'color' | 'center_id' | 'email'>;

export interface StaffContext {
  userId: string;
  staff: StaffInfo;
  center: CenterInfo;
}

/** 로그인한 사용자의 직원 소속 (여러 센터면 가장 먼저 등록된 곳) */
export const getStaffContext = cache(async (): Promise<StaffContext | null> => {
  const claims = await getClaims();
  if (!claims) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('staff')
    .select('id, name, role, color, center_id, email, centers!inner(id, name, timezone, booking_settings)')
    .eq('user_id', claims.sub)
    .is('deleted_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { centers, ...staff } = data;
  return { userId: claims.sub, staff, center: centers };
});

/** 관리자 영역 진입 확인. owner 옵션이면 대표만 */
export async function requireStaff(options: { owner?: boolean } = {}): Promise<StaffContext> {
  const context = await getStaffContext();
  if (!context) {
    const claims = await getClaims();
    redirect(claims ? '/403?reason=admin' : '/admin-login');
  }
  if (options.owner && context.staff.role !== 'owner') redirect('/403?reason=owner');
  return context;
}

export interface Membership {
  member_id: string;
  center_id: string;
  center_name: string;
  center_timezone: string;
  name: string;
  onboarded_at: string | null;
  notify_enabled: boolean;
  marketing_agreed_at: string | null;
}

/** 로그인한 사용자의 회원 소속 목록 */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const claims = await getClaims();
  if (!claims) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_memberships');
  return data ?? [];
});

/** 회원 영역 진입 확인. 첫 로그인 동의 전이면 /welcome 으로 보낸다. */
export async function requireMember(options: { allowNotOnboarded?: boolean } = {}): Promise<Membership> {
  const memberships = await getMemberships();
  const membership = memberships[0];
  if (!membership) {
    const claims = await getClaims();
    redirect(claims ? '/403?reason=member' : '/login');
  }
  if (!options.allowNotOnboarded && !membership.onboarded_at) redirect('/welcome');
  return membership;
}
