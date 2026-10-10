'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

import { BottomTabs } from '@/components/member/bottom-tabs';
import { MemberProvider, type MemberSession } from '@/components/member/member-context';
import { MemberRealtime } from '@/components/member/member-realtime';
import { SkipLink } from '@/components/skip-link';
import { Skeleton } from '@/components/ui/skeleton';
import { parseBookingSettings } from '@/features/centers/schema';

import { useMounted } from '../lib/use-mounted';
import { currentCenter, currentMember } from '../mock/session';
import { ProtoBanner } from './proto-banner';

function readSession(): MemberSession {
  const member = currentMember();
  const center = currentCenter();
  return {
    memberId: String(member.id),
    name: String(member.name),
    centerId: String(center.id),
    centerName: String(center.name),
    timezone: String(center.timezone),
    bookingSettings: parseBookingSettings(center.booking_settings),
    notifyEnabled: !!member.notify_enabled,
    marketingAgreed: !!member.marketing_agreed_at,
  };
}

function MemberBody({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session] = useState(readSession);
  const onboarded = !!currentMember().onboarded_at;

  // 실제 앱처럼 첫 로그인 동의 전이면 동의 화면으로
  useEffect(() => {
    if (!onboarded) router.replace('/welcome/');
  }, [onboarded, router, pathname]);
  if (!onboarded) return null;

  return (
    <MemberProvider session={session}>
      <SkipLink />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto min-h-dvh max-w-md bg-background pb-[calc(4rem+env(safe-area-inset-bottom))] outline-none"
      >
        {children}
      </main>
      <BottomTabs />
      <MemberRealtime />
    </MemberProvider>
  );
}

/** 회원 영역: 실제 앱(src/app/m/layout.tsx)과 같은 구성 */
export function MemberShell({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  return (
    <>
      <ProtoBanner />
      {mounted ? (
        <MemberBody>{children}</MemberBody>
      ) : (
        <div className="mx-auto max-w-md space-y-3 p-4">
          <Skeleton className="h-10 w-40 rounded-lg" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      )}
    </>
  );
}
