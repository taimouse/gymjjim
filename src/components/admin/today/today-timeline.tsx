'use client';

import { CalendarPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { useSessionDrawer } from '@/components/admin/sessions/use-session-drawer';
import { ErrorAlert } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { type CalendarSession, useSessionsInRange } from '@/features/sessions/queries';
import { toAppErrorCode } from '@/lib/errors';
import { dayRangeUtc, formatTime } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

type Phase = 'upcoming' | 'inProgress' | 'ended' | 'cancelled';

const PHASE_TONE = {
  upcoming: 'muted',
  inProgress: 'brand',
  ended: 'muted',
  cancelled: 'danger',
} as const satisfies Record<Phase, 'muted' | 'brand' | 'danger'>;

function phaseOf(session: CalendarSession, now: Date): Phase {
  if (session.status === 'cancelled') return 'cancelled';
  const time = now.getTime();
  if (time >= Date.parse(session.ends_at)) return 'ended';
  if (time >= Date.parse(session.starts_at)) return 'inProgress';
  return 'upcoming';
}

/** 오늘의 수업 타임라인: 시간순 카드(예약/정원 · 대기 · 진행 중 강조). 누르면 세션 드로어 */
export function TodayTimeline({ today }: { today: string }) {
  const t = useTranslations('today.timeline');
  const { centerId, timezone } = useAdmin();
  const drawer = useSessionDrawer();
  const range = useMemo(() => dayRangeUtc(today, timezone), [today, timezone]);
  const sessions = useSessionsInRange(centerId, range.from, range.to);
  const now = useNow(30_000);
  const rows = sessions.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {sessions.isPending ? (
          <div className="space-y-3" aria-hidden>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : sessions.isError ? (
          <ErrorAlert code={toAppErrorCode(sessions.error)} />
        ) : rows.length === 0 ? (
          <Empty className="border py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarPlus aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t('empty')}</EmptyTitle>
              <EmptyDescription>{t('emptyHint')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild variant="outline">
                <Link href="/admin/calendar">{t('goCalendar')}</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ol className="space-y-3">
            {rows.map((session) => (
              <li key={session.id}>
                <TimelineItem
                  session={session}
                  phase={phaseOf(session, now)}
                  timezone={timezone}
                  onOpen={() => drawer.open(session.id)}
                />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineItem({
  session,
  phase,
  timezone,
  onOpen,
}: {
  session: CalendarSession;
  phase: Phase;
  timezone: string;
  onOpen: () => void;
}) {
  const t = useTranslations('today.timeline');
  const tCommon = useTranslations('common');
  const minutes = Math.round((Date.parse(session.ends_at) - Date.parse(session.starts_at)) / 60_000);
  const cancelled = phase === 'cancelled';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={phase === 'inProgress' ? 'time' : undefined}
      className={cn(
        'flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
        phase === 'inProgress' &&
          'border-primary bg-brand-soft/40 ring-2 ring-primary/25 hover:bg-brand-soft/60',
        (phase === 'ended' || cancelled) && 'opacity-60',
      )}
    >
      <div className="w-24 shrink-0">
        <p className="text-lg font-bold tabular-nums">{formatTime(session.starts_at, timezone)}</p>
        <p className="text-sm text-muted-foreground">{tCommon('minutes', { count: minutes })}</p>
      </div>
      <span
        className="h-10 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: session.program?.color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-semibold', cancelled && 'line-through')}>{session.program?.name}</p>
        <p className="truncate text-sm text-muted-foreground">
          {session.instructor?.name ?? t('noInstructor')}
        </p>
      </div>
      {!cancelled && (
        <div className="shrink-0 text-right">
          <p className="numeric">
            <span className="sr-only">{t('bookedLabel')}</span>
            <span className="text-2xl font-bold">{session.booked_count}</span>
            <span className="text-muted-foreground"> / {session.capacity}</span>
          </p>
          {session.waitlist_count > 0 && (
            <p className="text-sm font-medium text-info">
              {t('waitlist', { count: session.waitlist_count })}
            </p>
          )}
        </div>
      )}
      <Badge variant={PHASE_TONE[phase]} className="w-16 shrink-0">
        {t(phase)}
      </Badge>
    </button>
  );
}
