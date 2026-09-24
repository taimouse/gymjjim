import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';

import { AdminProvider, type AdminSession } from '@/components/admin/admin-context';
import { AdminNav } from '@/components/admin/admin-nav';
import { AdminTopbar } from '@/components/admin/admin-topbar';
import { CommandPalette } from '@/components/admin/command-palette';
import { MemberDrawer } from '@/components/admin/members/member-drawer';
import { RealtimeSync } from '@/components/admin/realtime-sync';
import { SessionDrawer } from '@/components/admin/sessions/session-drawer';
import { BrandMark } from '@/components/brand-mark';
import { parseBookingSettings } from '@/features/centers/schema';
import { requireStaff } from '@/lib/auth/session';

/**
 * 관리자 셸: 왼쪽 사이드바(메뉴 5개) + 상단 바(⌘K 검색 · 센터명 · 계정).
 * PC(xl, 1280px~) 라벨 표시, 태블릿(md~xl) 아이콘만, 폰은 메뉴 버튼으로 여는 시트.
 */
export default async function AdminShellLayout({ children }: { children: ReactNode }) {
  const { center, staff } = await requireStaff();
  const session: AdminSession = {
    centerId: center.id,
    centerName: center.name,
    timezone: center.timezone,
    bookingSettings: parseBookingSettings(center.booking_settings),
    staffId: staff.id,
    staffName: staff.name,
    role: staff.role,
  };

  return (
    <AdminProvider session={session}>
      <div className="flex min-h-dvh bg-surface">
        <aside className="sticky top-0 hidden h-dvh w-18 shrink-0 flex-col gap-6 border-r bg-sidebar px-3 py-4 md:flex xl:w-60 xl:px-4">
          <Link href="/admin" className="flex justify-center rounded-lg xl:justify-start">
            <BrandMark labelClassName="hidden xl:inline" />
          </Link>
          <AdminNav compactOnTablet />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopbar />
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
      {/* ⌘K·회원·수업 드로어는 URL(?member=, ?session=) 을 읽으므로 Suspense 로 감싼다 */}
      <Suspense>
        <CommandPalette />
        <MemberDrawer />
        <SessionDrawer />
      </Suspense>
      <RealtimeSync />
    </AdminProvider>
  );
}
