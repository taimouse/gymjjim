import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { PlatformNav, PlatformTopbar } from '@/components/platform/platform-shell';
import { SkipLink } from '@/components/skip-link';
import { requirePlatformAdmin } from '@/lib/auth/session';

export const metadata: Metadata = { robots: { index: false } };

/**
 * 운영자 콘솔 셸. proxy 의 클레임 검사와 별개로 DB(platform_admins)로 한 번 더 확인한다.
 * 센터 업무 화면(/admin)과 섞이지 않도록 메뉴·상단 바를 따로 둔다.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const admin = await requirePlatformAdmin();

  return (
    <>
      <SkipLink />
      <div className="flex min-h-dvh bg-surface">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-sidebar px-4 py-4 md:flex">
          <Link href="/platform" className="rounded-lg">
            <BrandMark />
          </Link>
          <PlatformNav />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <PlatformTopbar adminName={admin.name} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 p-4 outline-none md:p-6">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
