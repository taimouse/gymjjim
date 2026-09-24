import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { MyBookingsView } from '@/components/member/my-bookings/my-bookings-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('member.myBookings');
  return { title: t('title') };
}

export default function MyBookingsPage() {
  return (
    <Suspense>
      <MyBookingsView />
    </Suspense>
  );
}
