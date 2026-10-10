/** @/lib/auth/action-context 대신: 서버 액션의 권한 확인 (트레이너는 대표 전용 액션에서 FORBIDDEN) */
import type { StaffContext } from '@/lib/auth/session';

import { staffContext } from './session';

export async function staffActionContext(options: { owner?: boolean } = {}): Promise<StaffContext | null> {
  const context = staffContext();
  if (options.owner && context.staff.role !== 'owner') return null;
  return context;
}

export async function platformActionContext() {
  return null;
}
