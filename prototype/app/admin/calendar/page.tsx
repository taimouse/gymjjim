'use client';

import { Suspense } from 'react';

import { CalendarView } from '@/components/admin/calendar/calendar-view';

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}
