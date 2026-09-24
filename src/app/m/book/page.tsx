import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { BookView } from '@/components/member/book/book-view';
import { requireMember } from '@/lib/auth/session';
import { todayKey } from '@/lib/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('member.book');
  return { title: t('title') };
}

export default async function BookPage() {
  const membership = await requireMember();
  return (
    <Suspense>
      <BookView today={todayKey(membership.center_timezone)} />
    </Suspense>
  );
}
