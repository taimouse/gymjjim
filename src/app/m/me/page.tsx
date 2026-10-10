import { Ticket } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CreditWallet } from '@/components/member/me/credit-wallet';
import { MyPassCard, type MyPass } from '@/components/member/me/my-pass-card';
import { NotificationSettings } from '@/components/member/me/notification-settings';
import { SignOutButton } from '@/components/sign-out-button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { requireMember } from '@/lib/auth/session';
import { todayKey } from '@/lib/format';
import {
  creditPrograms,
  programsForProduct,
  PROGRAM_USAGE_SELECT,
  type ProgramUsageRow,
} from '@/features/programs/usage';
import { computePassState, pickPrimaryPass } from '@/lib/pass-status';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('member.me');
  return { title: t('title') };
}

const USABLE = new Set(['active', 'on_hold', 'upcoming']);

/** 내 정보: 이용권 카드 · 크레딧(충전 요청) · 알림 설정 · 로그아웃 */
export default async function MePage() {
  const membership = await requireMember();
  const t = await getTranslations('member.me');
  const today = todayKey(membership.center_timezone);
  const supabase = await createClient();
  const programsQuery = supabase
    .from('programs')
    .select(PROGRAM_USAGE_SELECT)
    .eq('center_id', membership.center_id)
    .is('deleted_at', null)
    .order('sort_order')
    .overrideTypes<ProgramUsageRow[], { merge: false }>();
  const { data } = await supabase
    .from('member_passes')
    .select(
      'id, name, product_id, status, start_date, end_date, total_count, remaining_count, period_limit_count, period_limit_unit, deleted_at, holds:pass_holds(start_date, end_date)',
    )
    .eq('member_id', membership.member_id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('end_date', { ascending: true, nullsFirst: false });

  const programs: ProgramUsageRow[] = (await programsQuery).data ?? [];
  const passes: MyPass[] = data ?? [];
  const usable = passes.filter((pass) => USABLE.has(computePassState(pass, today)));
  // 쓸 수 있는 이용권이 없으면 가장 최근에 끝난 것 하나를 보여준다 (만료 · 소진 상태 확인용)
  const latest = pickPrimaryPass(passes, today);
  const shown = usable.length > 0 ? usable : latest ? [latest] : [];

  return (
    <div className="space-y-8 px-4 pt-5 pb-8">
      <header>
        <h1 className="text-2xl font-bold">{t('greeting', { name: membership.name })}</h1>
        <p className="text-muted-foreground">{t('center', { center: membership.center_name })}</p>
      </header>

      <section aria-labelledby="me-passes" className="space-y-3">
        <h2 id="me-passes" className="text-lg font-bold">
          {t('passes')}
        </h2>
        {shown.length === 0 ? (
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
