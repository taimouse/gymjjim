'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { useErrorText } from '@/components/form-messages';
import { Checkbox } from '@/components/ui/checkbox';
import { cancelBookingAction } from '@/features/booking/actions';
import { memberKeys } from '@/features/members/queries';
import { type RosterBooking, sessionKeys } from '@/features/sessions/queries';

/** 직원의 예약 취소. 늦은 취소(차감)는 되돌릴 수 없으므로 확인창 + "차감하지 않고 취소" 선택 */
export function CancelBookingDialog({
  booking,
  sessionId,
  startsAt,
  freeCancelHours,
  onClose,
}: {
  booking: RosterBooking;
  sessionId: string;
  startsAt: string;
  freeCancelHours: number;
  onClose: () => void;
}) {
  const t = useTranslations('calendar.cancelBooking');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [waive, setWaive] = useState(false);
  const [pending, startTransition] = useTransition();
  const [now] = useState(() => Date.now());
  const isLate = now > Date.parse(startsAt) - freeCancelHours * 3_600_000;

  const confirm = () =>
    startTransition(async () => {
      const result = await cancelBookingAction({ bookingId: booking.id, waivePenalty: isLate && waive });
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionKeys.roster(sessionId) }),
        queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
        queryClient.invalidateQueries({ queryKey: memberKeys.all }),
      ]);
      toast.success(t('done'));
      onClose();
    });

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('title', { name: booking.member?.name ?? '' })}
      description={isLate ? t('late') : t('free')}
      confirmLabel={t('confirm')}
      onConfirm={confirm}
      pending={pending}
    >
      {isLate && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <Checkbox checked={waive} onCheckedChange={(value) => setWaive(value === true)} />
          {t('waive')}
        </label>
      )}
    </ConfirmDialog>
  );
}
