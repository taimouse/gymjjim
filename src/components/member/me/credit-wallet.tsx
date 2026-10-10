'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { CreditHistory } from '@/components/credit-history';
import { useErrorText } from '@/components/form-messages';
import { useMember } from '@/components/member/member-context';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { memberBookingKeys } from '@/features/booking/queries';
import { cancelCreditRequest } from '@/features/credits/actions';
import { useMyCreditHistory, useMyCredits } from '@/features/credits/queries';
import type { UsableProgram } from '@/features/programs/usage';
import { formatDateTime, formatWon } from '@/lib/format';

import { ChargeSheet } from './charge-sheet';

/**
 * 내 크레딧: 잔액을 크게, 충전 요청(결제 연동 전이라 센터가 입금 확인 후 충전)과 최근 내역.
 * 크레딧은 이용권과 별개인 지갑이라, 이용권이 없어도 크레딧을 받는 수업을 예약할 수 있다.
 */
export function CreditWallet({ programs }: { programs: (UsableProgram & { cost: number })[] }) {
  const t = useTranslations('member.credits');
  const errorText = useErrorText();
  const { centerId, memberId, timezone } = useMember();
  const queryClient = useQueryClient();
  const credits = useMyCredits(centerId);
  const history = useMyCreditHistory(memberId);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const pendingRequest = credits.data?.pending ?? null;
  const cancelRequest = () =>
    startTransition(async () => {
      if (!pendingRequest) return;
      const result = await cancelCreditRequest(pendingRequest.id);
      await queryClient.invalidateQueries({ queryKey: memberBookingKeys.all });
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      toast.success(t('requestCancelled'));
    });

  return (
    <section id="credits" aria-labelledby="me-credits" className="scroll-mt-4 space-y-3">
      <h2 id="me-credits" className="text-lg font-bold">
        {t('title')}
      </h2>
      {credits.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : credits.data ? (
        <article className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Coins className="size-4" aria-hidden />
                {t('balanceLabel')}
              </p>
              <p className="mt-1 text-4xl font-bold numeric">
                {credits.data.balance}
                <span className="ml-0.5 text-base font-semibold">{t('unit')}</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('price', { price: formatWon(credits.data.price) })}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{t('hint')}</p>
          {programs.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-semibold">{t('programs')}</p>
              <ul className="divide-y rounded-xl border">
                {programs.map((program) => (
                  <li key={program.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: program.color }}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{program.name}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-brand-soft-foreground">
                      {t('programCost', { count: program.cost })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingRequest ? (
            <div className="space-y-2 rounded-xl bg-info-soft p-4 text-info-soft-foreground">
              <p className="font-semibold">
                {t('pending', {
                  amount: pendingRequest.amount,
                  total: formatWon(pendingRequest.amount * pendingRequest.unit_price),
                })}
              </p>
              <p className="text-sm">
                {t('pendingHint', { time: formatDateTime(pendingRequest.created_at, timezone) })}
              </p>
              <Button variant="outline" size="sm" onClick={cancelRequest} disabled={pending}>
                {pending && <Spinner />}
                {t('cancelRequest')}
              </Button>
            </div>
          ) : (
            <Button size="lg" className="h-12 w-full text-base" onClick={() => setChargeOpen(true)}>
              {t('charge')}
            </Button>
          )}

          <CreditHistory rows={history.data} pending={history.isPending} timezone={timezone} />
        </article>
      ) : null}

      {credits.data && (
        <ChargeSheet open={chargeOpen} onOpenChange={setChargeOpen} price={credits.data.price} />
      )}
    </section>
  );
}
