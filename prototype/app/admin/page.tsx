'use client';

import { Suspense } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { TodayView } from '@/components/admin/today/today-view';
import { todayKey } from '@/lib/format';

/** 관리자 첫 화면 "오늘" (src/app/admin/(shell)/page.tsx) */
export default function TodayPage() {
  const { timezone } = useAdmin();
  return (
    <Suspense>
      <TodayView today={todayKey(timezone)} />
    </Suspense>
  );
}
