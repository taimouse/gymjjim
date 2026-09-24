import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/admin/page-header';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('members');
  return { title: t('title') };
}

// STEP 6 에서 회원 목록 화면으로 바뀐다.
export default async function MembersPage() {
  const t = await getTranslations('members');
  return <PageHeader title={t('title')} />;
}
