'use client';

import { Suspense } from 'react';

import { MyBookingsView } from '@/components/member/my-bookings/my-bookings-view';

export default function MyBookingsPage() {
  return (
    <Suspense>
      <MyBookingsView />
    </Suspense>
  );
}
