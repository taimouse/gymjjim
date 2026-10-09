import 'server-only';

import { getPlatformAdmin, getStaffContext, type PlatformAdmin, type StaffContext } from './session';

/**
 * 서버 액션용 권한 확인. 리다이렉트 대신 null 을 돌려주므로 액션은 FORBIDDEN 코드로 응답한다.
 * (proxy 가 서버 액션 경로를 건너뛸 수 있으므로 액션마다 반드시 호출한다 — Next.js 16 문서)
 */
export async function staffActionContext(options: { owner?: boolean } = {}): Promise<StaffContext | null> {
  const context = await getStaffContext();
  if (!context) return null;
  if (options.owner && context.staff.role !== 'owner') return null;
  return context;
}

/** 운영자 서버 액션용 권한 확인. 최종 판단은 RPC(assert_platform_admin)·RLS 가 다시 한다 */
export async function platformActionContext(): Promise<PlatformAdmin | null> {
  return getPlatformAdmin();
}
