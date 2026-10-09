'use client';

import {
  AlertTriangle,
  Building2,
  ChevronRight,
  type LucideIcon,
  ReceiptText,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/admin/page-header';
import { ErrorAlert } from '@/components/form-messages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformSummary } from '@/features/platform/queries';
import { CENTER_STATUSES } from '@/features/platform/schema';
import { toAppErrorCode } from '@/lib/errors';
import { daysUntil, formatDateKey, formatDDay, formatMonthKey, formatNumber } from '@/lib/format';

import { CenterStatusBadge } from './status-badges';

const ROW_LINK =
  'flex min-h-14 items-center gap-3 px-4 py-2 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50';

/** 운영자 대시보드: 월 반복 매출 · 이번 달 청구/입금 · 연체 · 센터 상태, 체험 종료 임박 */
export function PlatformDashboard({ today }: { today: string }) {
  const t = useTranslations('platform.dashboard');
  const month = `${today.slice(0, 8)}01`;
  const summary = usePlatformSummary(month);
  const monthLabel = formatMonthKey(month);

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {summary.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : summary.isError ? (
        <ErrorAlert code={toAppErrorCode(summary.error)} />
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <NumberCard
              icon={TrendingUp}
              label={t('mrr')}
              value={formatNumber(summary.data.mrr)}
              unit={t('wonUnit')}
              detail={t('mrrDetail')}
            />
            <NumberCard
              icon={ReceiptText}
              label={t('billed', { month: monthLabel })}
              value={formatNumber(summary.data.billed)}
              unit={t('wonUnit')}
              detail={t('billedDetail', {
                paid: formatNumber(summary.data.paid),
                unpaid: formatNumber(summary.data.unpaid),
              })}
            />
            <NumberCard
              icon={AlertTriangle}
              label={t('overdue')}
              value={formatNumber(summary.data.overdue_amount)}
              unit={t('wonUnit')}
              detail={t('overdueDetail', { count: summary.data.overdue_count })}
            />
            <NumberCard
              icon={Building2}
              label={t('activeCenters')}
              value={formatNumber(summary.data.centers.active)}
              unit={t('centerUnit')}
              detail={t('activeCentersDetail', {
                trial: summary.data.centers.trial,
                suspended: summary.data.centers.suspended,
              })}
            />
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('trialEnding')}</CardTitle>
                <CardDescription>{t('trialEndingDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.data.trial_ending.length === 0 ? (
                  <p className="text-muted-foreground">{t('trialEndingEmpty')}</p>
                ) : (
                  <ul className="divide-y rounded-xl border">
                    {summary.data.trial_ending.map((center) => (
                      <li key={center.id}>
                        <Link href={`/platform/centers?center=${center.id}`} className={ROW_LINK}>
                          <span className="min-w-0 flex-1 truncate font-semibold">{center.name}</span>
                          <span className="text-sm text-muted-foreground">
                            {formatDateKey(center.trial_ends_at)}
                          </span>
                          <span className="w-14 text-right font-bold numeric">
                            {formatDDay(daysUntil(center.trial_ends_at, today))}
                          </span>
                          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('byStatus')}</CardTitle>
                <CardDescription>{t('byStatusDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y rounded-xl border">
                  {CENTER_STATUSES.map((status) => (
                    <li key={status}>
                      <Link href={`/platform/centers?status=${status}`} className={ROW_LINK}>
                        <CenterStatusBadge status={status} />
                        <span className="ml-auto text-2xl font-bold numeric">
                          {formatNumber(summary.data.centers[status])}
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function NumberCard({
  icon: Icon,
  label,
  value,
  unit,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {label}
      </dt>
      <dd className="mt-2">
        <span className="text-4xl font-bold numeric tracking-tight">{value}</span>
        {unit && <span className="ml-1 text-lg font-semibold text-muted-foreground">{unit}</span>}
        {detail && <span className="mt-1 block text-sm text-muted-foreground">{detail}</span>}
      </dd>
    </div>
  );
}
