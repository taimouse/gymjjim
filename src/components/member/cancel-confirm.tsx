'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { useErrorText } from '@/components/form-messages';
import { cancelBookingAction } from '@/features/booking/actions';
import { memberBookingKeys } from '@/features/booking/queries';
import { cn } from '@/lib/utils';

/**
 * 취소 전에 "복구되는지 / 차감되는지"를 분명히 알려준다.
 * - 대기 취소: 차감 없음
 * - 무료 취소 기한 전: 횟수 복구 (기간권은 기록에 남지 않음)
 * - 기한 후: 1회 차감 (기간권은 늦은 취소로 기록)
 */
export function cancelNotice(params: {
  status: 'booked' | 'waitlisted';
  startsAt: string;
  freeCancelHours: number;
  countPass: boolean;
  now: Date;
}): 'waitlist' | 'free' | 'period' | 'late' | 'latePeriod' {
  if (params.status === 'waitlisted') return 'waitlist';
  const free = params.now.getTime() <= Date.parse(params.startsAt) - params.freeCancelHours * 3_600_000;
  if (free) return params.countPass ? 'free' : 'period';
  return params.countPass ? 'late' : 'latePeriod';
}

export function CancelNotice({ notice }: { notice: ReturnType<typeof cancelNotice> }) {
  const t = useTranslations('member.cancel');
  const warn = notice === 'late' || notice === 'latePeriod';
  return (
    <p
      role="status"
      className={cn(
        'rounded-xl p-4 text-base font-semibold',
        warn
          ? 'bg-warning-soft text-warning-soft-foreground'
          : 'bg-success-soft text-success-soft-foreground',
      )}
    >
      {t(notice)}
    </p>
  );
}

/** 회원 본인 예약·대기 취소 + 결과 토스트 (복구 / 1회 차감 / 취소) */
export function useCancelBooking() {
  const t = useTranslations('member.cancel');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const cancel = (bookingId: string, countPass: boolean, onDone: () => void) =>
    startTransition(async () => {
      const result = await cancelBookingAction({ bookingId });
      await queryClient.invalidateQueries({ queryKey: memberBookingKeys.all });
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      const { restored, status } = result.data;
      toast.success(
        t(restored ? 'doneRestored' : status === 'late_cancelled' && countPass ? 'doneLate' : 'done'),
      );
      onDone();
    });

  return { cancel, pending };
}
