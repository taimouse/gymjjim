import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { TodayView } from '@/components/admin/today/today-view';
import { requireStaff } from '@/lib/auth/session';
import { todayKey } from '@/lib/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('today');
  return { title: t('title') };
}

/** 관리자 첫 화면 "오늘" */
export default async function TodayPage() {
  const { center } = await requireStaff();
  return (
    <Suspense>
      <TodayView today={todayKey(center.timezone)} />
    </Suspense>
  );
}
