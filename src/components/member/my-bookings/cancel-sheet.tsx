'use client';

import { useTranslations } from 'next-intl';

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
import { Spinner } from '@/components/ui/spinner';
import type { MyBookingRow } from '@/features/booking/queries';
import { formatDateTime } from '@/lib/format';

/** 취소 확인 바텀시트: "지금 취소하면 횟수가 복구됩니다 / 1회 차감됩니다"를 먼저 보여준다 */
export function CancelSheet({
  row,
  now,
  open,
  onOpenChange,
}: {
  row: MyBookingRow;
  now: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('member.cancel');
  const { timezone, bookingSettings } = useMember();
  const { cancel, pending } = useCancelBooking();
  const countPass = row.pass_type !== 'period';
  const notice = cancelNotice({
    status: row.status === 'waitlisted' ? 'waitlisted' : 'booked',
    startsAt: row.starts_at,
    freeCancelHours: bookingSettings.free_cancel_hours_before,
    countPass,
    now,
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-md text-base">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t('title')}</DrawerTitle>
          <DrawerDescription className="text-base">
            {row.program_name} · {formatDateTime(row.starts_at, timezone)}
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4">
          <CancelNotice notice={notice} />
        </div>
        <DrawerFooter className="grid grid-cols-2 gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <DrawerClose asChild>
            <Button variant="outline" size="lg" disabled={pending}>
              {t('keep')}
            </Button>
          </DrawerClose>
          <Button
            variant="destructive"
            size="lg"
            onClick={() => cancel(row.booking_id, countPass, () => onOpenChange(false))}
            disabled={pending}
          >
            {pending && <Spinner />}
            {t('confirm')}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
