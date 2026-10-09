import { redirect } from 'next/navigation';

import { getClaims, getMemberships, getPlatformAdmin, getStaffContext, isBlocked } from '@/lib/auth/session';

/** 첫 진입: 로그인 상태와 소속(DB 기준)에 따라 운영자·관리자·회원 화면으로 보낸다. */
export default async function RootPage() {
  const claims = await getClaims();
  if (!claims) redirect('/login');

  if (await getPlatformAdmin()) redirect('/platform');
  if (await getStaffContext()) redirect('/admin');

  const [membership] = await getMemberships();
  if (membership) redirect(membership.onboarded_at ? '/m' : '/welcome');

  // 소속 센터가 정지·해지됐으면 그 안내를, 아니면 회원 연결 안내를 보여준다
  redirect((await isBlocked()) ? '/403?reason=suspended' : '/403?reason=member');
}
