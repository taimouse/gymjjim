'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Clock, Ticket, UserRound, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useErrorText } from '@/components/form-messages';
import { CancelNotice, cancelNotice, useCancelBooking } from '@/components/member/cancel-confirm';
import { useMember } from '@/components/member/member-context';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { bookSessionAction } from '@/features/booking/actions';
import { memberBookingKeys, type ScheduleRow, useBookingPreview } from '@/features/booking/queries';
import { isAppErrorCode, toAppErrorCode } from '@/lib/errors';
import { formatDate, formatDateKey, formatDateTime, formatTimeRange } from '@/lib/format';
import { sessionAvailability } from '@/lib/session-status';

/** 수업 바텀시트: 정보 · 사용할 이용권 · 취소 규칙 한 줄 → [예약하기] 한 번 */
export function BookingSheet({
  row,
  now,
  open,
  onOpenChange,
}: {
  row: ScheduleRow;
  now: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('member');
  const tCommon = useTranslations('common');
  const errorText = useErrorText();
  const { timezone, bookingSettings } = useMember();
  const queryClient = useQueryClient();
  const preview = useBookingPreview(open && !row.my_status ? row.session_id : null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pending, startTransition] = useTransition();
  const cancelling = useCancelBooking();

  const availability = sessionAvailability(
    { ...row, status: 'scheduled' },
    bookingSettings.close_minutes_before,
    now,
  );
  const started = now.getTime() >= Date.parse(row.starts_at);
  const mine = row.my_status === 'booked' || row.my_status === 'waitlisted';
  const pass = preview.data?.pass ?? null;
  const countPass = (row.my_status ? row.my_pass_type : pass?.type) !== 'period';
  const canBook = !row.my_status && ['open', 'almost', 'waitlist'].includes(availability);
  const freeUntil = new Date(
    Date.parse(row.starts_at) - bookingSettings.free_cancel_hours_before * 3_600_000,
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: memberBookingKeys.all });

  const book = () =>
    startTransition(async () => {
      const result = await bookSessionAction({ sessionId: row.session_id });
      await refresh();
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      toast.success(
        result.data.status === 'waitlisted'
          ? t('sheet.waitlisted', { position: result.data.waitlist_position ?? 0 })
          : t('sheet.booked'),
      );
      onOpenChange(false);
    });

  const cancel = () => {
    if (row.my_booking_id) cancelling.cancel(row.my_booking_id, countPass, () => onOpenChange(false));
  };

  const previewError = preview.data?.error;
  const passError = preview.isError
    ? toAppErrorCode(preview.error)
    : isAppErrorCode(previewError)
      ? previewError
      : 'NO_VALID_PASS';

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      onAnimationEnd={(opened) => !opened && setConfirmCancel(false)}
    >
      <DrawerContent className="mx-auto max-w-md text-base">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2 text-xl font-bold">
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: row.program_color }} />
            {row.program_name}
          </DrawerTitle>
          <DrawerDescription className="text-base">
            {formatDate(row.starts_at, timezone)} {formatTimeRange(row.starts_at, row.ends_at, timezone)}
          </DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 overflow-y-auto px-4 pb-2">
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <UserRound className="size-5 text-muted-foreground" aria-hidden />
              {row.instructor_name ?? t('book.noInstructor')}
            </li>
            <li className="flex items-center gap-2">
              <Users className="size-5 text-muted-foreground" aria-hidden />
              {t('sheet.capacity', { capacity: row.capacity, booked: row.booked_count })}
            </li>
          </ul>

          {canBook && (
            <div className="rounded-xl border p-4">
              <p className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                <Ticket className="size-4" aria-hidden />
                {t('sheet.passToUse')}
              </p>
              {preview.isPending ? (
                <Skeleton className="h-6 w-48" />
              ) : pass ? (
                <p className="font-semibold">
                  {pass.remaining_count === null
                    ? t('sheet.passUnlimited', { name: pass.name })
                    : t('sheet.passRemaining', { name: pass.name, count: pass.remaining_count })}
                  {pass.end_date && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {t('sheet.passEnds', { date: formatDateKey(pass.end_date) })}
                    </span>
                  )}
                </p>
              ) : (
                <p className="font-semibold text-danger">{errorText(passError)}</p>
              )}
            </div>
          )}

          <StatusLine row={row} availability={availability} started={started} />

          {confirmCancel && mine ? (
            <CancelNotice
              notice={cancelNotice({
                status: row.my_status === 'waitlisted' ? 'waitlisted' : 'booked',
                startsAt: row.starts_at,
                freeCancelHours: bookingSettings.free_cancel_hours_before,
                countPass,
                now,
              })}
            />
          ) : (
            (canBook || (mine && !started)) && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t(countPass ? 'sheet.cancelRule' : 'sheet.cancelRulePeriod', {
                  time: formatDateTime(freeUntil, timezone),
                })}
              </p>
            )
          )}
        </div>

        <DrawerFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {mine && !started ? (
            confirmCancel ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setConfirmCancel(false)}
                  disabled={cancelling.pending}
                >
                  {t('cancel.keep')}
                </Button>
                <Button variant="destructive" size="lg" onClick={cancel} disabled={cancelling.pending}>
                  {cancelling.pending && <Spinner />}
                  {t('cancel.confirm')}
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="lg" onClick={() => setConfirmCancel(true)}>
                {row.my_status === 'waitlisted' ? t('sheet.cancelWaitlist') : t('sheet.cancel')}
              </Button>
            )
          ) : canBook ? (
            <Button size="lg" className="h-14 text-lg" onClick={book} disabled={pending || !pass}>
              {pending && <Spinner />}
              {availability === 'waitlist' ? t('sheet.joinWaitlist') : t('sheet.book')}
            </Button>
          ) : (
            <DrawerClose asChild>
              <Button variant="outline" size="lg">
                {tCommon('close')}
              </Button>
            </DrawerClose>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** 내 예약 상태 · 대기 안내 · 마감 안내 한 줄 */
function StatusLine({
  row,
  availability,
  started,
}: {
  row: ScheduleRow;
  availability: ReturnType<typeof sessionAvailability>;
  started: boolean;
}) {
  const t = useTranslations('member.sheet');
  const box = 'rounded-xl p-4';
  switch (row.my_status) {
    case 'booked':
      return (
        <p className={`${box} bg-brand-soft font-semibold text-brand-soft-foreground`}>
          {t('alreadyBooked')}
        </p>
      );
    case 'waitlisted':
      return (
        <p className={`${box} bg-info-soft font-semibold text-info-soft-foreground`}>
          {t('alreadyWaitlisted', { position: row.my_waitlist_position ?? 0 })}
        </p>
      );
    case 'attended':
      return <p className={`${box} bg-success-soft text-success-soft-foreground`}>{t('attendedInfo')}</p>;
    case 'no_show':
      return <p className={`${box} bg-warning-soft text-warning-soft-foreground`}>{t('noShowInfo')}</p>;
  }
  if (availability === 'waitlist') {
    return (
      <p className={`${box} bg-info-soft text-info-soft-foreground`}>
        {t('waitlistInfo', { count: row.waitlist_count })}
      </p>
    );
  }
  if (availability === 'closed' || availability === 'ended') {
    return (
      <p className={`${box} bg-muted text-muted-foreground`}>
        {started ? t('startedInfo') : t('closedInfo')}
      </p>
    );
  }
  return null;
}
