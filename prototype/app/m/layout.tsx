'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { BottomTabs } from '@/components/member/bottom-tabs';

import { ProtoBanner } from '../../components/proto-banner';
import { ProtoGate } from '../../components/proto-gate';
import { useProtoState } from '../../lib/store';

/** 회원 화면: 모바일 폭 + 하단 탭. 가입 동의 전이면 동의 화면으로 보낸다 */
export default function MemberLayout({ children }: { children: ReactNode }) {
  const state = useProtoState();
  const pathname = usePathname();
  const router = useRouter();
  const onWelcome = pathname.startsWith('/m/welcome');

  useEffect(() => {
    if (state && !state.privacyAgreedAt && !onWelcome) router.replace('/m/welcome/');
  }, [state, onWelcome, router]);

  return (
    <div className="min-h-dvh bg-surface">
      <ProtoBanner />
      <main className="mx-auto max-w-md px-4 pt-6 pb-28">
        <ProtoGate>{() => children}</ProtoGate>
      </main>
      {!onWelcome && <BottomTabs />}
    </div>
  );
}
