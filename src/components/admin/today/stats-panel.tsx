'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert } from '@/components/form-messages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import {
  attendanceRate,
  type StatsPeriod,
  type StatsRow,
  useCenterStats,
} from '@/features/dashboard/queries';
import { toAppErrorCode } from '@/lib/errors';
import { formatDateKey, formatMonthKey, formatShortDateKey } from '@/lib/format';

/** 주간(최근 7일, 일별) · 월간(최근 6개월, 월별) 막대 차트 2개: 예약·출석 / 신규 회원·재등록 */
export function StatsPanel({ period }: { period: StatsPeriod }) {
  const t = useTranslations('today.stats');
  const { centerId } = useAdmin();
  const stats = useCenterStats(centerId, period);

  if (stats.isPending) {
    return (
      <div className="grid gap-6 xl:grid-cols-2" aria-hidden>
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (stats.isError) return <ErrorAlert code={toAppErrorCode(stats.error)} />;

  const label = (bucket: string) => (period === 'week' ? formatShortDateKey(bucket) : formatMonthKey(bucket));
  const fullLabel = (bucket: string) =>
    period === 'week' ? formatDateKey(bucket, { weekday: true }) : formatMonthKey(bucket, { year: true });
  const data = stats.data.map((row) => ({
    ...row,
    label: label(row.bucket),
    fullLabel: fullLabel(row.bucket),
  }));
  const total = (key: keyof Omit<StatsRow, 'bucket'>) => stats.data.reduce((sum, row) => sum + row[key], 0);
  const rate = attendanceRate({ attended: total('attended'), attendance_base: total('bookings') });
  const description = period === 'week' ? t('weekDescription') : t('monthDescription');

  const bookingConfig = {
    bookings: { label: t('bookings'), color: 'var(--chart-2)' },
    attended: { label: t('attended'), color: 'var(--chart-1)' },
  } satisfies ChartConfig;
  const memberConfig = {
    new_members: { label: t('newMembers'), color: 'var(--chart-3)' },
    renewals: { label: t('renewals'), color: 'var(--chart-4)' },
  } satisfies ChartConfig;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard
        title={t('bookingsChart')}
        description={description}
        summary={`${t('totalBookings', { count: total('bookings') })} · ${
          rate === null ? t('noRate') : t('attendanceRate', { rate })
        }`}
      >
        <ChartContainer config={bookingConfig} className="h-72 w-full">
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(_, payload) => payload[0]?.payload?.fullLabel} />
              }
            />
            <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
            <Bar dataKey="bookings" fill="var(--color-bookings)" radius={4} />
            <Bar dataKey="attended" fill="var(--color-attended)" radius={4} />
          </BarChart>
        </ChartContainer>
      </ChartCard>
      <ChartCard
        title={t('membersChart')}
        description={description}
        summary={t('totalMembers', { newMembers: total('new_members'), renewals: total('renewals') })}
      >
        <ChartContainer config={memberConfig} className="h-72 w-full">
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(_, payload) => payload[0]?.payload?.fullLabel} />
              }
            />
            <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
            <Bar dataKey="new_members" fill="var(--color-new_members)" radius={4} />
            <Bar dataKey="renewals" fill="var(--color-renewals)" radius={4} />
          </BarChart>
        </ChartContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  description,
  summary,
  children,
}: {
  title: string;
  description: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <p className="pt-1 text-xl font-bold numeric">{summary}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
