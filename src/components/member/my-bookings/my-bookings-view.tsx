'use client';

import { CalendarCheck, History } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useMember } from '@/components/member/member-context';
import { QueryError } from '@/components/member/query-error';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type MyBookingRow, useMyBookings } from '@/features/booking/queries';
import { useNow } from '@/lib/use-now';

import { BookingItem } from './booking-item';
import { CancelSheet } from './cancel-sheet';

type Tab = 'upcoming' | 'past';

/** 내 예약: 다가오는 예약 / 지난 기록. 탭은 URL(?tab=past)에 남긴다 */
export function MyBookingsView() {
  const t = useTranslations('member.myBookings');
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'past' ? 'past' : 'upcoming';

  const selectTab = (value: string) => {
    // usePathname 은 basePath 를 빼고 주므로 브라우저 주소의 경로를 그대로 쓴다
    const path = window.location.pathname;
    window.history.replaceState(null, '', value === 'past' ? `${path}?tab=past` : path);
  };

  return (
    <>
      <header className="px-4 pt-5 pb-3">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
      </header>
      <Tabs value={tab} onValueChange={selectTab} className="gap-3">
        <div className="sticky top-0 z-30 bg-background/95 px-4 pb-2 backdrop-blur">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upcoming" className="text-base">
              {t('upcoming')}
            </TabsTrigger>
            <TabsTrigger value="past" className="text-base">
              {t('past')}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="upcoming" className="px-4 pb-6 text-base">
          <BookingList upcoming />
        </TabsContent>
        <TabsContent value="past" className="px-4 pb-6 text-base">
          <BookingList upcoming={false} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function BookingList({ upcoming }: { upcoming: boolean }) {
  const t = useTranslations('member.myBookings');
  const { centerId } = useMember();
  const bookings = useMyBookings(centerId, upcoming);
  const now = useNow();
  // 닫히는 애니메이션 동안 내용이 남아 있도록 행과 open 을 따로 둔다
  const [cancelling, setCancelling] = useState<{ row: MyBookingRow; open: boolean } | null>(null);

  if (bookings.isPending) {
    return (
      <ul className="space-y-3" aria-hidden>
        {Array.from({ length: 3 }, (_, index) => (
          <li key={index}>
            <Skeleton className="h-28 w-full rounded-2xl" />
          </li>
        ))}
      </ul>
    );
  }
  if (bookings.isError) return <QueryError error={bookings.error} onRetry={() => void bookings.refetch()} />;

  const rows = bookings.data;
  if (rows.length === 0) {
    return (
      <Empty className="border py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {upcoming ? <CalendarCheck aria-hidden /> : <History aria-hidden />}
          </EmptyMedia>
          <EmptyTitle className="text-base">{upcoming ? t('emptyUpcoming') : t('emptyPast')}</EmptyTitle>
          {upcoming && <EmptyDescription>{t('emptyUpcomingHint')}</EmptyDescription>}
        </EmptyHeader>
        {upcoming && (
          <EmptyContent>
            <Button asChild>
              <Link href="/m/book">{t('goBook')}</Link>
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.booking_id}>
            <BookingItem
              row={row}
              upcoming={upcoming}
              now={now}
              onCancel={() => setCancelling({ row, open: true })}
            />
          </li>
        ))}
      </ul>
      {cancelling && (
        <CancelSheet
          key={cancelling.row.booking_id}
          row={cancelling.row}
          now={now}
          open={cancelling.open}
          onOpenChange={(open) => setCancelling({ row: cancelling.row, open })}
        />
      )}
    </>
  );
}
