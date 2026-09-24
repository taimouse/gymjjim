import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/admin/page-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calendar');
  return { title: t('title') };
}

// STEP 7 에서 FullCalendar 화면으로 바뀐다.
export default async function CalendarPage() {
  const t = await getTranslations('calendar');
  return <PageHeader title={t('title')} />;
}
