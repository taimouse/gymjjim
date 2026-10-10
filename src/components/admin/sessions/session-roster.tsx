'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, UserX, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { useErrorText } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { setAttendanceAction } from '@/features/booking/actions';
import type { AttendanceStatus } from '@/features/booking/schema';
import { type RosterBooking, sessionKeys } from '@/features/sessions/queries';
import { maskPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

import { CancelBookingDialog } from './cancel-booking-dialog';

/** 예약자 명단: 출석/노쇼 토글 → 확인창 없이 바로 반영 + "되돌리기" 토스트 */
export function SessionRoster({
  sessionId,
  bookings,
  startsAt,
  freeCancelHours,
}: {
  sessionId: string;
  bookings: RosterBooking[];
  startsAt: string;
  freeCancelHours: number;
}) {
  const t = useTranslations('calendar.drawer');
  const tCommon = useTranslations('common');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState<RosterBooking | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: sessionKeys.roster(sessionId) }),
      queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
    ]);

  const change = async (booking: RosterBooking, status: AttendanceStatus, previous: AttendanceStatus) => {
    const result = await setAttendanceAction({ bookingId: booking.id, status });
    if (!result.ok) {
      toast.error(errorText(result.code));
      return;
    }
    await refresh();
    const name = booking.member?.name ?? '';
    const message =
      status === 'attended'
        ? t('markedAttended', { name })
        : status === 'no_show'
          ? t('markedNoShow', { name })
          : t('markedBooked', { name });
    toast.success(message, {
      action:
        status === 'booked'
          ? undefined
          : { label: tCommon('undo'), onClick: () => void change(booking, previous, status) },
    });
  };

  const toggle = (booking: RosterBooking, target: 'attended' | 'no_show') => {
    const current = booking.status as AttendanceStatus;
    void change(booking, current === target ? 'booked' : target, current);
  };

  if (bookings.length === 0) {
    return <p className="py-6 text-center text-muted-foreground">{t('noBookings')}</p>;
  }

  return (
    <>
      <ul className="divide-y rounded-xl border">
        {bookings.map((booking) => (
          <li key={booking.id} className="flex min-h-16 items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">
                <span className="truncate">{booking.member?.name}</span>
                {booking.booked_by === 'staff' && <Badge variant="muted">{t('bookedByStaff')}</Badge>}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {maskPhone(booking.member?.phone)}
                {booking.pass?.remaining_count != null &&
                  ` · ${t('remaining', { count: booking.pass.remaining_count })}`}
                {booking.credits_used > 0 && ` · ${t('paidByCredit', { count: booking.credits_used })}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant={booking.status === 'attended' ? 'default' : 'outline'}
                aria-pressed={booking.status === 'attended'}
                onClick={() => toggle(booking, 'attended')}
                className={cn(
                  booking.status === 'attended' && 'bg-success text-success-foreground hover:bg-success/90',
                )}
              >
                <Check aria-hidden />
                {t('attended')}
              </Button>
              <Button
                size="sm"
                variant={booking.status === 'no_show' ? 'default' : 'outline'}
                aria-pressed={booking.status === 'no_show'}
                onClick={() => toggle(booking, 'no_show')}
                className={cn(
                  booking.status === 'no_show' && 'bg-danger text-danger-foreground hover:bg-danger/90',
                )}
              >
                <UserX aria-hidden />
                {t('noShow')}
              </Button>
              {booking.status === 'booked' && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('cancelBooking')}
                  onClick={() => setCancelling(booking)}
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {cancelling && (
        <CancelBookingDialog
          booking={cancelling}
          sessionId={sessionId}
          startsAt={startsAt}
          freeCancelHours={freeCancelHours}
          onClose={() => setCancelling(null)}
        />
      )}
    </>
  );
}
