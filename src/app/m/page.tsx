import { getTranslations } from 'next-intl/server';

import { SignOutButton } from '@/components/sign-out-button';
import { requireMember } from '@/lib/auth/session';

// STEP 8 에서 예약 탭(/m/book)으로 바뀐다.
export default async function MemberHomePage() {
  const membership = await requireMember();
  const t = await getTranslations('member.placeholder');
  return (
    <main className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">{t('title', { name: membership.name })}</h1>
      <p className="text-muted-foreground">{membership.center_name}</p>
      <SignOutButton to="member" variant="outline" />
    </main>
  );
}
