'use client';

import { CalendarClock, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import type { ScheduleRow } from '@/features/booking/queries';
import { formatDate, formatTimeRange } from '@/lib/format';
import { sessionAvailability } from '@/lib/session-status';

import { protoActions } from '../lib/store';

const CLOSE_MINUTES = 30;

/** 수업 바텀시트: 예약 / 대기 신청 / 취소 (이용권 선택·차감은 프로토타입에서 생략) */
export function BookingDrawer({
  row,
  timezone,
  now,
  onClose,
}: {
  row: ScheduleRow | null;
  timezone: string;
  now: Date;
  onClose: () => void;
}) {
  const t = useTranslations('member.sheet');
  const tCancel = useTranslations('member.cancel');
  const tProto = useTranslations('prototype.member');
  const tBook = useTranslations('member.book');
  if (!row) return null;
  const availability = sessionAvailability({ ...row, status: 'scheduled' }, CLOSE_MINUTES, now);
  const closed = availability === 'closed' || availability === 'ended';

  const book = () => {
    const status = protoActions.book(row.session_id);
    if (status === 'booked') toast.success(t('booked'));
    if (status === 'waitlisted') toast.success(t('waitlisted', { position: 1 }));
    onClose();
  };
  const cancel = () => {
    protoActions.cancel(row.session_id);
    toast.success(tCancel('done'));
    onClose();
  };

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-w-md text-base">
        <DrawerHeader className="gap-2 text-left">
          <DrawerTitle className="flex items-center gap-2 text-xl font-bold">
            <span className="size-3 rounded-full" style={{ backgroundColor: row.program_color }} />
            {row.program_name}
          </DrawerTitle>
          <DrawerDescription className="space-y-1 text-base">
            <span className="flex items-center gap-1.5">
              <CalendarClock className="size-4" aria-hidden />
              {formatDate(row.starts_at, timezone)} {formatTimeRange(row.starts_at, row.ends_at, timezone)}
            </span>
            <span className="flex items-center gap-1.5">
              <UserRound className="size-4" aria-hidden />
              {row.instructor_name
                ? tProto('instructor', { name: row.instructor_name })
                : tBook('noInstructor')}
            </span>
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-2 px-4">
          <p className="rounded-xl bg-muted p-3 font-medium">
            {t('capacity', { capacity: row.capacity, booked: row.booked_count })}
          </p>
          {row.my_status === 'booked' && <p className="text-primary">{t('alreadyBooked')}</p>}
          {row.my_status === 'waitlisted' && (
            <p className="text-info-soft-foreground">
              {t('alreadyWaitlisted', { position: row.my_waitlist_position ?? 1 })}
            </p>
          )}
          {!row.my_status && availability === 'waitlist' && (
            <p className="text-muted-foreground">{t('waitlistInfo', { count: row.waitlist_count })}</p>
          )}
          {!row.my_status && closed && <p className="text-muted-foreground">{t('closedInfo')}</p>}
        </div>
        <DrawerFooter>
          {row.my_status === 'booked' || row.my_status === 'waitlisted' ? (
            <Button size="lg" variant="outline" className="text-danger" onClick={cancel} disabled={closed}>
              {row.my_status === 'booked' ? t('cancel') : t('cancelWaitlist')}
            </Button>
          ) : (
            <Button size="lg" onClick={book} disabled={closed}>
              {availability === 'waitlist' ? t('joinWaitlist') : t('book')}
            </Button>
          )}
          <Button size="lg" variant="ghost" onClick={onClose}>
            {tProto('sheetClose')}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
