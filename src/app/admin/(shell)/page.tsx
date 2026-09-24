import { getTranslations } from 'next-intl/server';

import { SignOutButton } from '@/components/sign-out-button';
import { requireStaff } from '@/lib/auth/session';

// STEP 9 에서 "오늘" 화면으로 바뀐다.
export default async function AdminHomePage() {
  const { center, staff } = await requireStaff();
  const t = await getTranslations('admin.placeholder');
  return (
    <main className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">{t('title', { center: center.name })}</h1>
      <p className="text-muted-foreground">{t('greeting', { name: staff.name })}</p>
      <SignOutButton to="admin" variant="outline" />
    </main>
  );
}
