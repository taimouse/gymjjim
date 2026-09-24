import { redirect } from 'next/navigation';

import { getClaims, getMemberships, getStaffContext } from '@/lib/auth/session';

/** 첫 진입: 로그인 상태와 소속(DB 기준)에 따라 관리자·회원 화면으로 보낸다. */
export default async function RootPage() {
  const claims = await getClaims();
  if (!claims) redirect('/login');

  if (await getStaffContext()) redirect('/admin');

  const [membership] = await getMemberships();
  if (membership) redirect(membership.onboarded_at ? '/m' : '/welcome');

  redirect('/403?reason=member');
}
