'use client';

import { getDate, getISODay, parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { addDaysToKey } from '@/lib/format';
import { cn } from '@/lib/utils';

const WEEKDAY_KEYS = ['1', '2', '3', '4', '5', '6', '7'] as const;

/** 가로 스크롤 날짜 칩: 오늘 ~ 예약 오픈 마지막 날 */
export function DateChips({
  today,
  days,
  selected,
  onSelect,
}: {
  today: string;
  days: number;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const t = useTranslations('member.book');
  const tWeek = useTranslations('calendar.weekdayShort');
  const selectedRef = useRef<HTMLButtonElement>(null);
  const dates = Array.from({ length: days + 1 }, (_, index) => addDaysToKey(today, index));

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  return (
    <div
      className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1"
      role="group"
    >
      {dates.map((date, index) => {
        const active = date === selected;
        const weekday = WEEKDAY_KEYS[getISODay(parseISO(date)) - 1]!;
        const label = index === 0 ? t('today') : index === 1 ? t('tomorrow') : tWeek(weekday);
        return (
          <button
            key={date}
            ref={active ? selectedRef : undefined}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(date)}
            className={cn(
              'flex min-h-16 min-w-14 shrink-0 snap-start flex-col items-center justify-center rounded-2xl border px-2 transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'bg-card text-foreground hover:bg-muted',
              !active && weekday === '7' && 'text-danger',
              !active && weekday === '6' && 'text-info',
            )}
          >
            <span className={cn('text-xs font-medium', active ? 'opacity-90' : 'text-muted-foreground')}>
              {label}
            </span>
            <span className="text-xl font-bold tabular-nums">{getDate(parseISO(date))}</span>
          </button>
        );
      })}
    </div>
  );
}
