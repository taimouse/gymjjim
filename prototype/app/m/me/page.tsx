'use client';

import { useQuery } from '@tanstack/react-query';
import { Ticket } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useMember } from '@/components/member/member-context';
import { CreditWallet } from '@/components/member/me/credit-wallet';
import { MyPassCard, type MyPass } from '@/components/member/me/my-pass-card';
import { NotificationSettings } from '@/components/member/me/notification-settings';
import { SignOutButton } from '@/components/sign-out-button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { todayKey } from '@/lib/format';
import {
  creditPrograms,
  programsForProduct,
  PROGRAM_USAGE_SELECT,
  type ProgramUsageRow,
} from '@/features/programs/usage';
import { computePassState, pickPrimaryPass } from '@/lib/pass-status';
import { createClient } from '@/lib/supabase/client';

const USABLE = new Set(['active', 'on_hold', 'upcoming']);

/** 내 정보: 이용권 카드 · 크레딧 · 알림 설정 · 로그아웃 (src/app/m/me/page.tsx 와 같은 조회·구성) */
export default function MePage() {
  const t = useTranslations('member.me');
  const { memberId, name, centerName, timezone } = useMember();
  const today = todayKey(timezone);
  const passes = useQuery({
    queryKey: ['member-booking', 'my-passes', memberId],
    queryFn: async (): Promise<MyPass[]> => {
      const { data } = await createClient()
        .from('member_passes')
        .select(
          'id, name, product_id, status, start_date, end_date, total_count, remaining_count, period_limit_count, period_limit_unit, deleted_at, holds:pass_holds(start_date, end_date)',
        )
        .eq('member_id', memberId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('end_date', { ascending: true, nullsFirst: false });
      return data ?? [];
    },
  });

  const programQuery = useQuery({
    queryKey: ['member-booking', 'program-usage'],
    queryFn: async (): Promise<ProgramUsageRow[]> => {
      const { data } = await createClient()
        .from('programs')
        .select(PROGRAM_USAGE_SELECT)
        .is('deleted_at', null)
        .order('sort_order');
      return (data ?? []) as ProgramUsageRow[];
    },
  });
  const programs = programQuery.data ?? [];

  const all = passes.data ?? [];
  const usable = all.filter((pass) => USABLE.has(computePassState(pass, today)));
  const latest = pickPrimaryPass(all, today);
  const shown = usable.length > 0 ? usable : latest ? [latest] : [];

  return (
    <div className="space-y-8 px-4 pt-5 pb-8">
      <header>
        <h1 className="text-2xl font-bold">{t('greeting', { name })}</h1>
        <p className="text-muted-foreground">{t('center', { center: centerName })}</p>
      </header>

      <section aria-labelledby="me-passes" className="space-y-3">
        <h2 id="me-passes" className="text-lg font-bold">
          {t('passes')}
        </h2>
        {passes.isPending ? (
          <Skeleton className="h-36 rounded-2xl" />
        ) : shown.length === 0 ? (
          <Empty className="border py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Ticket aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">{t('noPasses')}</EmptyTitle>
              <EmptyDescription>{t('noPassesHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-3">
            {shown.map((pass) => (
              <li key={pass.id}>
                <MyPassCard
                  pass={pass}
                  today={today}
                  programs={programsForProduct(programs, pass.product_id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreditWallet programs={creditPrograms(programs)} />

      <NotificationSettings />

      <section aria-label={t('account')}>
        <SignOutButton to="member" variant="outline" className="h-12 w-full text-base" />
      </section>
    </div>
  );
}
