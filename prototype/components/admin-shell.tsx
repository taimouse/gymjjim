'use client';

import Link from 'next/link';
import { type ReactNode, Suspense, useState } from 'react';

import { AdminProvider, type AdminSession } from '@/components/admin/admin-context';
import { AdminNav } from '@/components/admin/admin-nav';
import { AdminTopbar } from '@/components/admin/admin-topbar';
import { CommandPalette } from '@/components/admin/command-palette';
import { MemberDrawer } from '@/components/admin/members/member-drawer';
import { RealtimeSync } from '@/components/admin/realtime-sync';
import { SessionDrawer } from '@/components/admin/sessions/session-drawer';
import { BrandMark } from '@/components/brand-mark';
import { SkipLink } from '@/components/skip-link';
import { Skeleton } from '@/components/ui/skeleton';
import { parseBookingSettings } from '@/features/centers/schema';

import { currentCenter, currentStaff, setStaffRole } from '../mock/session';
import { useMounted } from '../lib/use-mounted';
import { ProtoBanner } from './proto-banner';

function readSession(): AdminSession {
  // 실제 앱의 dev-login 처럼 ?as=staff 면 트레이너, ?as=owner 면 대표로 본다
  const as = new URLSearchParams(window.location.search).get('as');
  if (as === 'staff' || as === 'owner') setStaffRole(as);
  const center = currentCenter();
  const staff = currentStaff();
  return {
    centerId: String(center.id),
    centerName: String(center.name),
    timezone: String(center.timezone),
    bookingSettings: parseBookingSettings(center.booking_settings),
    staffId: String(staff.id),
    staffName: String(staff.name),
    role: staff.role as 'owner' | 'staff',
  };
}

function ShellBody({ children }: { children: ReactNode }) {
  const [session] = useState(readSession);
  return (
    <AdminProvider session={session}>
      <SkipLink />
      <div className="flex min-h-dvh bg-surface">
        <aside className="sticky top-0 hidden h-dvh w-18 shrink-0 flex-col gap-6 border-r bg-sidebar px-3 py-4 md:flex xl:w-60 xl:px-4">
          <Link href="/admin/" className="flex justify-center rounded-lg xl:justify-start">
            <BrandMark labelClassName="hidden xl:inline" />
          </Link>
          <AdminNav compactOnTablet />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 outline-none md:p-6">
            {children}
          </main>
        </div>
      </div>
      <Suspense>
        <CommandPalette />
        <MemberDrawer />
        <SessionDrawer />
      </Suspense>
      <RealtimeSync />
    </AdminProvider>
  );
}

/** 관리자 셸: 실제 앱(src/app/admin/(shell)/layout.tsx)과 같은 구성 */
export function AdminShell({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  return (
    <>
      <ProtoBanner />
      {mounted ? (
        <ShellBody>{children}</ShellBody>
      ) : (
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )}
    </>
  );
}
