'use client';

import { Ban, Clock, Pencil, UserPlus, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { EditSheet } from '@/components/admin/edit-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession, useSessionRoster } from '@/features/sessions/queries';
import { formatDate, formatTimeRange, maskPhone } from '@/lib/format';
import { AVAILABILITY_TONE, remainingSeats, sessionAvailability } from '@/lib/session-status';

import { CancelSessionDialog } from './cancel-session-dialog';
import { SessionEditSheet } from './session-edit-sheet';
import { SessionRoster } from './session-roster';
import { StaffBookDialog } from './staff-book-dialog';
import { useSessionDrawer } from './use-session-drawer';

type Dialog = 'book' | 'edit' | 'cancel' | null;

/** 수업 드로어: 예약자 명단(출석/노쇼) · 대기자 · 대리 예약 · 수정 · 폐강. 셸에 한 번 두고 ?session= 으로 연다 */
export function SessionDrawer() {
  const t = useTranslations('calendar');
  const { sessionId, close } = useSessionDrawer();
  const { timezone, bookingSettings } = useAdmin();
  const session = useSession(sessionId);
  const roster = useSessionRoster(sessionId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [now] = useState(() => new Date());

  if (!sessionId) return null;
  const data = session.data;
  const bookings = roster.data ?? [];
  const seated = bookings.filter((b) => ['booked', 'attended', 'no_show'].includes(b.status));
  const waitlist = bookings
    .filter((b) => b.status === 'waitlisted')
    .sort((a, b) => (a.waitlist_position ?? 0) - (b.waitlist_position ?? 0));
  const cancelled = bookings.filter((b) => b.status === 'cancelled' || b.status === 'late_cancelled');
  const availability = data ? sessionAvailability(data, bookingSettings.close_minutes_before, now) : null;
  const editable = data && data.status === 'scheduled' && availability !== 'ended';

  return (
    <>
      <EditSheet
        open
        onOpenChange={(open) => !open && close()}
        title={
          data ? (
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ backgroundColor: data.program?.color }} />
              {data.program?.name}
            </span>
          ) : (
            t('title')
          )
        }
        description={
          data ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
              <span className="flex items-center gap-1">
                <Clock className="size-4" aria-hidden />
                {formatDate(data.starts_at, timezone)}{' '}
                {formatTimeRange(data.starts_at, data.ends_at, timezone)}
              </span>
              <span className="flex items-center gap-1">
                <UserRound className="size-4" aria-hidden />
                {data.instructor?.name ?? t('drawer.noInstructor')}
              </span>
            </span>
          ) : undefined
        }
        className="sm:max-w-xl"
      >
        {!data ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted p-3">
                <p className="text-sm text-muted-foreground">{t('drawer.capacity')}</p>
                <p className="text-2xl font-bold numeric">
                  {data.booked_count}/{data.capacity}
                </p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-sm text-muted-foreground">{t('drawer.seatsLeft')}</p>
                <p className="text-2xl font-bold numeric">{remainingSeats(data)}</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-sm text-muted-foreground">{t('drawer.waitlistCount')}</p>
                <p className="text-2xl font-bold numeric">{data.waitlist_count}</p>
              </div>
            </div>
            {availability && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={AVAILABILITY_TONE[availability]}>{t(`availability.${availability}`)}</Badge>
                {data.cancel_reason && (
                  <span className="text-sm text-muted-foreground">
                    {t('drawer.cancelledReason', { reason: data.cancel_reason })}
                  </span>
                )}
                {data.note && <span className="text-sm text-muted-foreground">{data.note}</span>}
              </div>
            )}

            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setDialog('book')}>
                  <UserPlus aria-hidden />
                  {t('drawer.addMember')}
                </Button>
                <Button variant="outline" onClick={() => setDialog('edit')}>
                  <Pencil aria-hidden />
                  {t('drawer.edit')}
                </Button>
                <Button variant="ghost" className="ml-auto text-danger" onClick={() => setDialog('cancel')}>
                  <Ban aria-hidden />
                  {t('drawer.cancelSession')}
                </Button>
              </div>
            )}

            <section className="space-y-2">
              <h3 className="font-semibold">{t('drawer.booked', { count: seated.length })}</h3>
              {roster.isPending ? (
                <Skeleton className="h-32 rounded-xl" />
              ) : (
                <SessionRoster
                  sessionId={data.id}
                  bookings={seated}
                  startsAt={data.starts_at}
                  freeCancelHours={bookingSettings.free_cancel_hours_before}
                />
              )}
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">{t('drawer.waitlisted', { count: waitlist.length })}</h3>
              {waitlist.length === 0 ? (
                <p className="text-muted-foreground">{t('drawer.noWaitlist')}</p>
              ) : (
                <ol className="divide-y rounded-xl border">
                  {waitlist.map((booking) => (
                    <li key={booking.id} className="flex min-h-12 items-center gap-3 px-3">
                      <Badge variant="info">
                        {t('drawer.position', { position: booking.waitlist_position ?? 0 })}
                      </Badge>
                      <span className="font-medium">{booking.member?.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {maskPhone(booking.member?.phone)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {cancelled.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('drawer.cancelledList', { count: cancelled.length })}
              </p>
            )}
          </div>
        )}
      </EditSheet>

      {dialog === 'book' && data && <StaffBookDialog sessionId={data.id} onClose={() => setDialog(null)} />}
      {dialog === 'edit' && data && <SessionEditSheet session={data} onClose={() => setDialog(null)} />}
      {dialog === 'cancel' && data && (
        <CancelSessionDialog
          sessionId={data.id}
          affected={seated.filter((b) => b.status === 'booked').length + waitlist.length}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            close();
          }}
        />
      )}
    </>
  );
}
