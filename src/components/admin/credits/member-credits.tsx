'use client';

import { Check, Coins, Minus, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { CreditHistory } from '@/components/credit-history';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemberCredits } from '@/features/credits/queries';
import { formatDateTime, formatWon } from '@/lib/format';

import { AdjustCreditsDialog } from './adjust-credits-dialog';
import { useDecideCreditRequest } from './use-decide-request';

/** 회원 상세의 크레딧: 잔액을 크게 · 직접 충전/차감 · 대기 중인 충전 요청 승인 · 최근 내역 */
export function MemberCredits({ memberId }: { memberId: string }) {
  const t = useTranslations('credits');
  const { timezone } = useAdmin();
  const credits = useMemberCredits(memberId);
  const { decide, busyId } = useDecideCreditRequest();
  const [adjust, setAdjust] = useState<'charge' | 'deduct' | null>(null);

  if (credits.isPending) return <Skeleton className="h-28 rounded-2xl" />;
  if (!credits.data) return null;
  const { balance, pending, history } = credits.data;

  return (
    <section aria-label={t('title')} className="space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Coins className="size-4" aria-hidden />
            {t('title')}
          </p>
          <p className="text-3xl font-bold numeric">
            {balance}
            <span className="ml-0.5 text-base font-semibold">{t('unit')}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdjust('deduct')} disabled={balance === 0}>
            <Minus aria-hidden />
            {t('deduct')}
          </Button>
          <Button size="sm" onClick={() => setAdjust('charge')}>
            <Plus aria-hidden />
            {t('charge')}
          </Button>
        </div>
      </div>

      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-info-soft p-3 text-info-soft-foreground">
          <p className="min-w-0 flex-1">
            <span className="block font-semibold">
              {t('requests.amount', {
                amount: pending.amount,
                total: formatWon(pending.amount * pending.unit_price),
              })}
            </span>
            <span className="block text-sm">
              {t('requests.requestedAt', { time: formatDateTime(pending.created_at, timezone) })}
            </span>
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={busyId === pending.id}
            onClick={() => decide(pending, false)}
          >
            <X aria-hidden />
            {t('requests.reject')}
          </Button>
          <Button size="sm" disabled={busyId === pending.id} onClick={() => decide(pending, true)}>
            <Check aria-hidden />
            {t('requests.approve')}
          </Button>
        </div>
      )}

      <CreditHistory rows={history.slice(0, 5)} pending={false} timezone={timezone} />

      {adjust && (
        <AdjustCreditsDialog
          memberId={memberId}
          mode={adjust}
          balance={balance}
          onClose={() => setAdjust(null)}
        />
      )}
    </section>
  );
}
