import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { BrandMark } from '@/components/brand-mark';
import { PrivacyPolicy } from '@/components/privacy/privacy-policy';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy');
  return { title: t('title'), description: t('metaDescription') };
}

/** 개인정보 처리방침 (로그인 없이 누구나 볼 수 있다) */
export default async function PrivacyPage() {
  const t = await getTranslations('privacy');
  return (
    <main className="flex min-h-dvh justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <BrandMark />
        <div className="space-y-6 rounded-2xl border bg-background p-5 sm:p-8">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <PrivacyPolicy />
        </div>
      </div>
    </main>
  );
}
