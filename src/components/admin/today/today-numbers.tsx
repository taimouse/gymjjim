'use client';

import { CalendarCheck, type LucideIcon, Repeat, UserCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert } from '@/components/form-messages';
import { Skeleton } from '@/components/ui/skeleton';
import { attendanceRate, useTodaySummary } from '@/features/dashboard/queries';
import { useSessionsInRange } from '@/features/sessions/queries';
import { toAppErrorCode } from '@/lib/errors';
import { dayRangeUtc, formatMonthKey, formatNumber } from '@/lib/format';

/** 숫자는 4개만: 오늘 예약 수 · 오늘 출석률 · 이번 달 신규 회원 · 이번 달 재등록 */
export function TodayNumbers({ today }: { today: string }) {
  const t = useTranslations('today.numbers');
  const { centerId, timezone } = useAdmin();
  const summary = useTodaySummary(centerId);
  const range = useMemo(() => dayRangeUtc(today, timezone), [today, timezone]);
  const sessions = useSessionsInRange(centerId, range.from, range.to);

  if (summary.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }
  if (summary.isError) return <ErrorAlert code={toAppErrorCode(summary.error)} />;

  const data = summary.data;
  const rate = attendanceRate(data);
  const month = formatMonthKey(today);
  const sessionCount = (sessions.data ?? []).filter((session) => session.status === 'scheduled').length;

  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <NumberCard
        icon={CalendarCheck}
        label={t('bookings')}
        value={formatNumber(data.bookings)}
        unit={t('countUnit')}
        detail={sessions.data ? t('bookingsDetail', { count: sessionCount }) : undefined}
      />
      <NumberCard
        icon={UserCheck}
        label={t('attendance')}
        value={rate === null ? '-' : String(rate)}
        unit={rate === null ? undefined : t('percentUnit')}
        detail={
          rate === null
            ? t('attendanceWaiting')
            : t('attendanceDetail', { attended: data.attended, base: data.attendance_base })
        }
      />
      <NumberCard
        icon={UserPlus}
        label={t('newMembers')}
        value={formatNumber(data.new_members)}
        unit={t('peopleUnit')}
        detail={t('monthDetail', { month })}
      />
      <NumberCard
        icon={Repeat}
        label={t('renewals')}
        value={formatNumber(data.renewals)}
        unit={t('peopleUnit')}
        detail={t('monthDetail', { month })}
      />
    </dl>
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
