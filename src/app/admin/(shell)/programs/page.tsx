import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/admin/page-header';
import { ProgramsTabs, type ProgramsTab } from '@/components/admin/programs/programs-tabs';
import { firstParam } from '@/lib/search-params';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('programs');
  return { title: t('title') };
}

export default async function ProgramsPage({ searchParams }: PageProps<'/admin/programs'>) {
  const t = await getTranslations('programs');
  const tab: ProgramsTab = firstParam((await searchParams).tab) === 'products' ? 'products' : 'programs';
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <ProgramsTabs tab={tab} />
    </>
  );
}
