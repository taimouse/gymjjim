'use client';

import { ChevronRight, Coins } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useMember } from '@/components/member/member-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyCredits } from '@/features/credits/queries';
import { formatWon } from '@/lib/format';

/**
 * 내 크레딧: 잔액을 크게 보여주고 내 정보(충전 요청)로 이어준다.
 * 크레딧은 이용권이 없어도 크레딧을 받는 수업을 예약할 수 있는 지갑이라 예약 화면 맨 위에 둔다.
 */
export function MyCredits() {
  const t = useTranslations('member.credits');
  const { centerId } = useMember();
  const credits = useMyCredits(centerId);

  if (credits.isPending) return <Skeleton className="mt-3 h-20 rounded-xl" />;
  if (!credits.data) return null;
  const { balance, price, pending } = credits.data;

  return (
    <Link
      href="/m/me#credits"
      className="mt-3 flex items-center gap-4 rounded-xl bg-brand-soft px-4 py-3 text-brand-soft-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-background/70">
        <Coins className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t('title')}</span>
        <span className="block truncate text-sm opacity-80">
          {pending ? t('pendingShort', { amount: pending.amount }) : t('price', { price: formatWon(price) })}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="sr-only">{t('balanceLabel')}</span>
        <span className="text-3xl font-bold tabular-nums">{balance}</span>
        <span className="ml-0.5 text-base font-semibold">{t('unit')}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 opacity-60" aria-hidden />
    </Link>
  );
}
