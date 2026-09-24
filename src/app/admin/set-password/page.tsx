import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SetPasswordForm } from '@/components/admin/set-password-form';
import { BrandMark } from '@/components/brand-mark';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.setPassword');
  return { title: t('title') };
}

/** 초대 메일로 들어온 직원의 첫 비밀번호 설정 (관리자 셸 밖의 단독 화면) */
export default async function SetPasswordPage() {
  const t = await getTranslations('auth.setPassword');
  return (
    <main className="flex min-h-dvh justify-center bg-surface px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm space-y-8">
        <BrandMark />
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </header>
        <SetPasswordForm />
      </div>
    </main>
  );
}
