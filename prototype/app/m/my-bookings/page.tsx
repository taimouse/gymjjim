'use client';

import { CalendarCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { formatDate, formatTimeRange } from '@/lib/format';
import { useNow } from '@/lib/use-now';

import { upcomingBookings } from '../../../lib/selectors';
import { protoActions, useProtoState } from '../../../lib/store';

/** 내 예약: 다가오는 예약 + 취소 */
export default function MyBookingsPage() {
  const t = useTranslations('member.myBookings');
  const tBook = useTranslations('member.book');
  const tCancel = useTranslations('member.cancel');
  const state = useProtoState();
  const now = useNow();
  if (!state) return null;
  const items = upcomingBookings(state, now);
  const timezone = state.center.timezone;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <h2 className="font-semibold text-muted-foreground">{t('upcoming')}</h2>
      {items.length === 0 ? (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarCheck aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('emptyUpcoming')}</EmptyTitle>
            <EmptyDescription>{t('emptyUpcomingHint')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/m/book/">{t('goBook')}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="space-y-3">
          {items.map(({ booking, session }) => {
            const program = state.programs.find((p) => p.id === session.program_id);
            return (
              <li key={booking.id} className="flex items-center gap-3 rounded-xl border bg-background p-4">
                <span
                  className="h-12 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: program?.color }}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-lg font-semibold">{program?.name}</p>
                  <p className="text-muted-foreground">
                    {formatDate(session.starts_at, timezone)}{' '}
                    {formatTimeRange(session.starts_at, session.ends_at, timezone)}
                  </p>
                  <Badge variant={booking.status === 'booked' ? 'brand' : 'info'}>
                    {booking.status === 'booked'
                      ? tBook('myBooked')
                      : tBook('myWaitlist', { position: booking.waitlist_position ?? 1 })}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    protoActions.cancel(session.id);
                    toast.success(tCancel('done'));
                  }}
                >
                  {t('cancel')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
