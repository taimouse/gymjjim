import type { ReactNode } from 'react';

import { requireStaff } from '@/lib/auth/session';

/** 관리자 영역: 직원(owner/staff)만. proxy 의 클레임 검사와 별개로 DB 로 한 번 더 확인한다. */
export default async function AdminRootLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return children;
}
