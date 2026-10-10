'use client';

import { Coins, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { useErrorText } from '@/components/form-messages';
import { Skeleton } from '@/components/ui/skeleton';
import type { BookingPreview } from '@/features/booking/queries';
import type { AppErrorCode } from '@/lib/errors';
import { formatDateKey } from '@/lib/format';

/** 무엇으로 예약하는지: 이용권(먼저) / 크레딧(이용권이 없을 때) / 예약할 수 없는 이유 */
export function PaymentBox({
  preview,
  pending,
  errorCode,
}: {
  preview: BookingPreview | undefined;
  pending: boolean;
  errorCode: AppErrorCode;
}) {
  const t = useTranslations('member.sheet');
  const errorText = useErrorText();
  const pass = preview?.pass ?? null;
  const credit = preview?.credit ?? null;
  const byCredit = preview?.method === 'credit' && credit;

  return (
    <div className="rounded-xl border p-4">
      <p className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
        {byCredit ? <Coins className="size-4" aria-hidden /> : <Ticket className="size-4" aria-hidden />}
        {t(byCredit ? 'creditToUse' : 'passToUse')}
      </p>
      {pending ? (
        <Skeleton className="h-6 w-48" />
      ) : pass ? (
        <p className="font-semibold">
          {pass.remaining_count === null
            ? t('passUnlimited', { name: pass.name })
            : t('passRemaining', { name: pass.name, count: pass.remaining_count })}
          {pass.end_date && (
            <span className="ml-2 font-normal text-muted-foreground">
              {t('passEnds', { date: formatDateKey(pass.end_date) })}
            </span>
          )}
        </p>
      ) : byCredit ? (
        <p className="rounded-lg bg-brand-soft px-3 py-2 font-semibold text-brand-soft-foreground">
          {t('creditLine', { cost: credit.cost, after: credit.balance - credit.cost })}
        </p>
      ) : (
        <>
          <p className="font-semibold text-danger">{errorText(errorCode)}</p>
          {errorCode === 'CREDIT_INSUFFICIENT' && credit && (
            <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              {t('creditNeeded', { cost: credit.cost, balance: credit.balance })}
              <Link
                href="/m/me#credits"
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                {t('creditCharge')}
              </Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
