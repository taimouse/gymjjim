'use client';

import { ChevronRight, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useMember } from '@/components/member/member-context';
import { Skeleton } from '@/components/ui/skeleton';
import { type MyPassRow, useMyPasses } from '@/features/booking/queries';
import { formatDateKey, todayKey } from '@/lib/format';
import { computePassState } from '@/lib/pass-status';

const USABLE = new Set(['active', 'on_hold', 'upcoming']);

/** 지금 쓸 수 있는 횟수권 (잔여 횟수가 있는 이용권 중 사용 중·정지 중·시작 전) */
export function usableCreditPasses(passes: MyPassRow[] | undefined, today: string): MyPassRow[] {
  return (passes ?? []).filter(
    (pass) => pass.remaining_count !== null && USABLE.has(computePassState(pass, today)),
  );
}

/**
 * 내 횟수권: 지금 쓸 수 있는 횟수권의 남은 횟수 합계를 크게 보여준다.
 * 프로그램마다 차감 횟수가 달라서 예약 전에 남은 횟수를 바로 볼 수 있게 예약 화면 맨 위에 둔다.
 * 횟수권이 없는(기간권만 있는) 회원에게는 보이지 않는다.
 */
export function MyCredits() {
  const t = useTranslations('member.credits');
  const { memberId, timezone } = useMember();
  const passes = useMyPasses(memberId);
  const today = todayKey(timezone);

  if (passes.isPending) return <Skeleton className="mt-3 h-20 rounded-xl" />;
  const credits = usableCreditPasses(passes.data, today);
  if (credits.length === 0) return null;
  const total = credits.reduce((sum, pass) => sum + (pass.remaining_count ?? 0), 0);

  return (
    <Link
      href="/m/me"
      className="mt-3 flex items-center gap-4 rounded-xl bg-brand-soft px-4 py-3 text-brand-soft-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-background/70">
        <Ticket className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t('title')}</span>
        <span className="block truncate text-sm opacity-80">
          {credits
            .map((pass) =>
              pass.end_date
                ? `${t('detail', { name: pass.name, count: pass.remaining_count ?? 0 })} · ${t('ends', { date: formatDateKey(pass.end_date) })}`
                : t('detail', { name: pass.name, count: pass.remaining_count ?? 0 }),
            )
            .join(', ')}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="sr-only">{t('remainingLabel')}</span>
        <span className="text-3xl font-bold tabular-nums">{t('remaining', { count: total })}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 opacity-60" aria-hidden />
    </Link>
  );
}
