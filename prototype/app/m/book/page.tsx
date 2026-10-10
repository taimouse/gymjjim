'use client';

import { Suspense } from 'react';

import { BookView } from '@/components/member/book/book-view';
import { useMember } from '@/components/member/member-context';
import { todayKey } from '@/lib/format';

export default function BookPage() {
  const { timezone } = useMember();
  return (
    <Suspense>
      <BookView today={todayKey(timezone)} />
    </Suspense>
  );
}
