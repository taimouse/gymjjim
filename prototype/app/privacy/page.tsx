'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { BrandMark } from '@/components/brand-mark';
import { PrivacyPolicy } from '@/components/privacy/privacy-policy';

import { CENTER_INFO as center } from '../../mock/seed';

/** 개인정보 처리방침 (실제 앱의 /privacy 와 같은 본문) */
export default function PrivacyPage() {
  const t = useTranslations('privacy');
  return (
    <main className="flex min-h-dvh justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-2xl space-y-8">
        <Link href="/" className="inline-block">
          <BrandMark />
        </Link>
        <div className="space-y-6 rounded-2xl border bg-background p-5 sm:p-8">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <PrivacyPolicy center={center.name} />
        </div>
      </div>
    </main>
  );
}
