'use client';

import { useTranslations } from 'next-intl';

import { useMember } from '@/components/member/member-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MyBookingRow } from '@/features/booking/queries';
import { formatDate, formatTimeRange } from '@/lib/format';
import type { Tone } from '@/lib/pass-status';

const PASS_USED: ReadonlySet<MyBookingRow['status']> = new Set([
  'booked',
  'attended',
  'no_show',
  'late_cancelled',
]);

/** 예약 상태 뱃지 (색 + 텍스트) */
function useBookingBadge(row: MyBookingRow, now: Date): { tone: Tone; text: string } {
  const t = useTranslations('member');
  const tStatus = useTranslations('members.bookingStatus');
  if (row.session_status === 'cancelled') return { tone: 'danger', text: t('myBookings.cancelledSession') };
  switch (row.status) {
    case 'booked':
      return now.getTime() >= Date.parse(row.ends_at)
        ? { tone: 'muted', text: t('myBookings.pendingAttendance') }
        : { tone: 'brand', text: t('book.myBooked') };
    case 'waitlisted':
      return { tone: 'info', text: t('book.myWaitlist', { position: row.waitlist_position ?? 0 }) };
    case 'attended':
      return { tone: 'success', text: tStatus('attended') };
    case 'no_show':
    case 'late_cancelled':
      return { tone: 'warning', text: tStatus(row.status) };
    default:
      return { tone: 'muted', text: tStatus('cancelled') };
  }
}

/** 내 예약 카드: 날짜 · 시간 · 수업 · 강사 · 사용 이용권 · [취소] */
export function BookingItem({
  row,
  upcoming,
  now,
  onCancel,
}: {
  row: MyBookingRow;
  upcoming: boolean;
  now: Date;
  onCancel: () => void;
}) {
  const t = useTranslations('member');
  const { timezone } = useMember();
  const badge = useBookingBadge(row, now);
  const cancellable = upcoming && now.getTime() < Date.parse(row.starts_at);
  // 이용권을 실제로 쓴(차감된) 예약에만 이용권 이름을 보여준다
  const passUsed = row.session_status !== 'cancelled' && PASS_USED.has(row.status) ? row.pass_name : null;

  return (
    <article className="flex gap-3 rounded-2xl border bg-card p-4 shadow-xs">
      <span
        className="w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: row.program_color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">{formatDate(row.starts_at, timezone)}</p>
          <Badge variant={badge.tone} className="h-7 px-3">
            {badge.text}
          </Badge>
        </div>
        <p className="text-lg font-bold tabular-nums">
          {formatTimeRange(row.starts_at, row.ends_at, timezone)}
        </p>
        <p className="truncate">
          {row.program_name} · {row.instructor_name ?? t('book.noInstructor')}
        </p>
        {row.session_status === 'cancelled' && (
          <p className="text-sm text-danger">
            {t('myBookings.sessionCancelled')}
            {row.cancel_reason && ` ${t('myBookings.cancelReason', { reason: row.cancel_reason })}`}
          </p>
        )}
        {(passUsed || cancellable) && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              {passUsed && t('myBookings.passUsed', { name: passUsed })}
            </p>
            {cancellable && (
              <Button variant="outline" onClick={onCancel} className="shrink-0">
                {row.status === 'waitlisted' ? t('sheet.cancelWaitlist') : t('myBookings.cancel')}
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
