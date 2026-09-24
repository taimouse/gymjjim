import type { ReactNode } from 'react';

import { BottomTabs } from '@/components/member/bottom-tabs';
import { MemberProvider, type MemberSession } from '@/components/member/member-context';
import { MemberRealtime } from '@/components/member/member-realtime';
import { SkipLink } from '@/components/skip-link';
import { parseBookingSettings } from '@/features/centers/schema';
import { requireMember } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/** 회원 영역(모바일 우선): 센터에 연결되고 첫 로그인 동의를 마친 회원만. 하단 탭 3개 */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const membership = await requireMember();
  const supabase = await createClient();
  const { data: center } = await supabase
    .from('centers')
    .select('booking_settings')
    .eq('id', membership.center_id)
    .single();

  const session: MemberSession = {
    memberId: membership.member_id,
    name: membership.name,
    centerId: membership.center_id,
    centerName: membership.center_name,
    timezone: membership.center_timezone,
    bookingSettings: parseBookingSettings(center?.booking_settings),
    notifyEnabled: membership.notify_enabled,
    marketingAgreed: !!membership.marketing_agreed_at,
  };

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
