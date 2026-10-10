'use client';

import { Coins } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import type { ScheduleRow } from '@/features/booking/queries';
import { formatTime } from '@/lib/format';
import { remainingSeats, sessionAvailability } from '@/lib/session-status';
import { cn } from '@/lib/utils';

type Tone = 'success' | 'warning' | 'info' | 'danger' | 'muted' | 'brand';

/** 카드 오른쪽 상태 뱃지: 내 예약 상태가 있으면 그것, 없으면 "3자리 남음 / 대기 2명 / 마감" */
export function useSessionBadge(
  row: ScheduleRow,
  closeMinutes: number,
  now: Date,
): { tone: Tone; text: string } {
  const t = useTranslations('member.book');
  if (row.my_status === 'booked') return { tone: 'brand', text: t('myBooked') };
  if (row.my_status === 'waitlisted')
    return { tone: 'info', text: t('myWaitlist', { position: row.my_waitlist_position ?? 0 }) };
  if (row.my_status === 'attended') return { tone: 'success', text: t('myAttended') };
  const availability = sessionAvailability({ ...row, status: 'scheduled' }, closeMinutes, now);
  switch (availability) {
    case 'open':
      return { tone: 'success', text: t('seatsLeft', { count: remainingSeats(row) }) };
    case 'almost':
      return { tone: 'warning', text: t('seatsLeft', { count: remainingSeats(row) }) };
    case 'waitlist':
      return {
        tone: 'info',
        text: row.waitlist_count > 0 ? t('waitlistPeople', { count: row.waitlist_count }) : t('full'),
      };
    case 'ended':
      return { tone: 'muted', text: t('ended') };
    default:
      return { tone: 'danger', text: t('closed') };
  }
}

/** 수업 카드: 시간 · 프로그램 · 강사 · 상태 (카드 전체가 버튼, 누르면 바텀시트) */
export function SessionCard({
  row,
  timezone,
  closeMinutes,
  now,
  onOpen,
}: {
  row: ScheduleRow;
  timezone: string;
  closeMinutes: number;
  now: Date;
  onOpen: () => void;
}) {
  const t = useTranslations('member.book');
  const tCommon = useTranslations('common');
  const badge = useSessionBadge(row, closeMinutes, now);
  const minutes = Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60_000);
  const past = now.getTime() >= Date.parse(row.ends_at);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-xs transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]',
        past && 'opacity-60',
      )}
    >
      <span
        className="w-1.5 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: row.program_color }}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums">{formatTime(row.starts_at, timezone)}</span>
          <span className="text-sm text-muted-foreground">{tCommon('minutes', { count: minutes })}</span>
        </span>
        <span className="truncate">
          <span className="font-semibold">{row.program_name}</span>
          <span className="text-muted-foreground"> · {row.instructor_name ?? t('noInstructor')}</span>
        </span>
        {row.credit_cost !== null && (
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-sm font-semibold text-brand-soft-foreground">
            <Coins className="size-3.5" aria-hidden />
            {t('creditCost', { count: row.credit_cost })}
          </span>
        )}
      </span>
      <Badge variant={badge.tone} className="h-8 shrink-0 px-3 text-sm">
        {badge.text}
      </Badge>
    </button>
  );
}
