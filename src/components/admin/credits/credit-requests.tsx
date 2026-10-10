'use client';

import { Check, Coins, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAdmin } from '@/components/admin/admin-context';
import { useMemberDrawer } from '@/components/admin/members/use-member-drawer';
import { ErrorAlert } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePendingCreditRequests } from '@/features/credits/queries';
import { toAppErrorCode } from '@/lib/errors';
import { formatDateTime, formatWon, maskPhone } from '@/lib/format';

import { useDecideCreditRequest } from './use-decide-request';

/** 크레딧 충전 요청: 입금을 확인하고 승인하면 바로 충전된다 (결제 연동 전 수기 처리) */
export function CreditRequests() {
  const t = useTranslations('credits.requests');
  const { centerId, timezone } = useAdmin();
  const drawer = useMemberDrawer();
  const requests = usePendingCreditRequests(centerId);
  const { decide, busyId } = useDecideCreditRequest();
  const rows = requests.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Coins className="size-5 text-primary" aria-hidden />
          {t('title')}
          {rows.length > 0 && <Badge variant="warning">{rows.length}</Badge>}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {requests.isPending ? (
          <Skeleton className="h-14 rounded-lg" />
        ) : requests.isError ? (
          <ErrorAlert code={toAppErrorCode(requests.error)} />
        ) : rows.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-2.5">
                <button
                  type="button"
                  onClick={() => row.member && drawer.open(row.member.id)}
                  className="min-h-11 min-w-0 flex-1 rounded-lg px-1 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="block truncate">
                    <span className="font-semibold">{row.member?.name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {maskPhone(row.member?.phone ?? '')}
                    </span>
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {t('amount', { amount: row.amount, total: formatWon(row.amount * row.unit_price) })}
                    </span>
                    {` · ${formatDateTime(row.created_at, timezone)}`}
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t('reject')}
                  disabled={busyId === row.id}
                  onClick={() => decide(row, false)}
                >
                  <X aria-hidden />
                </Button>
                <Button className="shrink-0" disabled={busyId === row.id} onClick={() => decide(row, true)}>
                  <Check aria-hidden />
                  {t('approve')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
