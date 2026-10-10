import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { ProgramList } from '@/components/admin/programs/program-list';
import { firstParam } from '@/lib/search-params';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('programs');
  return { title: t('title') };
}

/** 프로그램(수업 템플릿). 이용권 상품은 /admin/passes 로 나뉘었다 */
export default async function ProgramsPage({ searchParams }: PageProps<'/admin/programs'>) {
  // 예전 탭 주소(?tab=products)는 이용권 메뉴로 보낸다
  if (firstParam((await searchParams).tab) === 'products') redirect('/admin/passes');
  return <ProgramList />;
}
