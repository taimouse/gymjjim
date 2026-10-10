'use client';

import { CalendarX2, ChevronRight, Repeat } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useMember } from '@/components/member/member-context';
import { QueryError } from '@/components/member/query-error';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemberSchedule } from '@/features/booking/queries';
import { addDaysToKey, formatDateKey } from '@/lib/format';
import { useNow } from '@/lib/use-now';

import { BookingSheet } from './booking-sheet';
import { DateChips } from './date-chips';
import { MyCredits } from './my-credits';
import { RepeatSheet } from './repeat-sheet';
import { SessionCard } from './session-card';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** 예약 탭: 날짜 칩 → 수업 카드 → 바텀시트 [예약하기] (3탭) */
export function BookView({ today }: { today: string }) {
  const t = useTranslations('member.book');
  const { centerId, centerName, timezone, bookingSettings } = useMember();
  const searchParams = useSearchParams();
  const now = useNow();
  // 닫히는 애니메이션 동안 내용이 남아 있도록 id 와 open 을 따로 둔다
  const [sheet, setSheet] = useState<{ id: string; open: boolean } | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);

  const lastDay = addDaysToKey(today, bookingSettings.open_days_before);
  const requested = searchParams.get('date') ?? '';
  const date = DATE_KEY.test(requested) && requested >= today && requested <= lastDay ? requested : today;
  const schedule = useMemberSchedule(centerId, date);
  const rows = schedule.data ?? [];
  const sheetRow = sheet ? rows.find((row) => row.session_id === sheet.id) : undefined;

  // 날짜는 URL(?date=)에 남긴다. 서버 왕복 없이 주소만 바꾼다 (Next 라우터와 동기화됨)
  const selectDate = (next: string) => {
    // usePathname 은 basePath 를 빼고 주므로 브라우저 주소의 경로를 그대로 쓴다
    const path = window.location.pathname;
    window.history.replaceState(null, '', next === today ? path : `${path}?date=${next}`);
  };

  return (
    <>
      <header className="px-4 pt-5">
        <p className="truncate text-sm text-muted-foreground">{centerName}</p>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <MyCredits />
        <Button
          variant="secondary"
          className="mt-3 h-12 w-full justify-between rounded-xl px-4 text-base"
          onClick={() => setRepeatOpen(true)}
        >
          <span className="flex items-center gap-2">
            <Repeat className="text-primary" aria-hidden />
            {t('repeat')}
          </span>
          <ChevronRight className="text-muted-foreground" aria-hidden />
        </Button>
      </header>
      <div className="sticky top-0 z-30 bg-background/95 px-4 py-3 backdrop-blur">
        <DateChips
          today={today}
          days={bookingSettings.open_days_before}
          selected={date}
          onSelect={selectDate}
        />
      </div>

      <section aria-labelledby="book-date" className="space-y-3 px-4 pt-1 pb-6">
        <h2 id="book-date" className="text-base font-semibold text-muted-foreground">
          {formatDateKey(date, { weekday: true })}
        </h2>
        {schedule.isPending ? (
          <ScheduleSkeleton />
        ) : schedule.isError ? (
          <QueryError error={schedule.error} onRetry={() => void schedule.refetch()} />
        ) : rows.length === 0 ? (
          <Empty className="border py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarX2 aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">{t('empty')}</EmptyTitle>
              <EmptyDescription>{t('emptyHint')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.session_id}>
                <SessionCard
                  row={row}
                  timezone={timezone}
                  closeMinutes={bookingSettings.close_minutes_before}
                  now={now}
                  onOpen={() => setSheet({ id: row.session_id, open: true })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet && sheetRow && (
        <BookingSheet
          key={sheet.id}
          row={sheetRow}
          now={now}
          open={sheet.open}
          onOpenChange={(open) => setSheet({ id: sheet.id, open })}
        />
      )}
      <RepeatSheet open={repeatOpen} onOpenChange={setRepeatOpen} />
    </>
  );
}

function ScheduleSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <li key={index}>
          <Skeleton className="h-[5.5rem] w-full rounded-2xl" />
        </li>
      ))}
    </ul>
  );
}
