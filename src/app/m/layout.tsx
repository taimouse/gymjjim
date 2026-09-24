import type { ReactNode } from 'react';

import { requireMember } from '@/lib/auth/session';

/** 회원 영역: 센터에 연결되고 첫 로그인 동의를 마친 회원만 */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  await requireMember();
  return children;
}
