'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { PageHeader } from '@/components/admin/page-header';
import { ProgramsTabs } from '@/components/admin/programs/programs-tabs';

function Programs() {
  const t = useTranslations('programs');
  const tab = useSearchParams().get('tab') === 'products' ? 'products' : 'programs';
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ProgramsTabs tab={tab} />
    </>
  );
}

/** 프로그램·이용권 (src/app/admin/(shell)/programs/page.tsx) */
export default function ProgramsPage() {
  return (
    <Suspense>
      <Programs />
    </Suspense>
  );
}
