'use client';

import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/skeleton';
import type { CreditTransactionRow } from '@/features/credits/queries';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** 크레딧 내역 (회원 내 정보 · 관리자 회원 상세 공용): 사유 · 시각 · +충전 / -사용 · 잔액 */
export function CreditHistory({
  rows,
  pending,
  timezone,
}: {
  rows: CreditTransactionRow[] | undefined;
  pending: boolean;
  timezone: string;
}) {
  const t = useTranslations('credits');

  if (pending) return <Skeleton className="h-24 rounded-xl" />;
  if (!rows || rows.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{t('historyEmpty')}</p>;
  }
  return (
    <div>
      <p className="mb-1 text-sm font-semibold">{t('history')}</p>
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block font-medium">{t(`reason.${row.reason}`)}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {formatDateTime(row.created_at, timezone)}
                {row.memo && ` · ${row.memo}`}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span
                className={cn(
                  'block font-bold tabular-nums',
                  row.delta > 0 ? 'text-success-soft-foreground' : 'text-foreground',
                )}
              >
                {t('delta', { delta: row.delta > 0 ? `+${row.delta}` : String(row.delta) })}
              </span>
              <span className="block text-sm text-muted-foreground tabular-nums">
                {t('balanceAfter', { count: row.balance_after })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
