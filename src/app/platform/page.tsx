import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PlatformDashboard } from '@/components/platform/platform-dashboard';
import { todayKey } from '@/lib/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.dashboard');
  return { title: t('title') };
}

/** 운영자 대시보드. 날짜는 한국 시간 기준 */
export default function PlatformHomePage() {
  return <PlatformDashboard today={todayKey()} />;
}
