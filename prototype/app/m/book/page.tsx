'use client';

import { CalendarX2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { DateChips } from '@/components/member/book/date-chips';
import { SessionCard } from '@/components/member/book/session-card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { formatDateKey, todayKey } from '@/lib/format';
import { useNow } from '@/lib/use-now';

import { BookingDrawer } from '../../../components/booking-drawer';
import { scheduleRows } from '../../../lib/selectors';
import { useProtoState } from '../../../lib/store';

const OPEN_DAYS = 7;
const CLOSE_MINUTES = 30;

/** 수업 예약: 날짜 칩 → 수업 카드 → 바텀시트 (공개된 수업만 보인다) */
export default function BookPage() {
  const t = useTranslations('member.book');
  const tProto = useTranslations('prototype.member');
  const state = useProtoState();
  const now = useNow();
  const timezone = state?.center.timezone ?? 'Asia/Seoul';
  const today = todayKey(timezone, now);
  const [selected, setSelected] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!state) return null;
  const rows = scheduleRows(state, selected, now);
  const openRow = rows.find((row) => row.session_id === openId) ?? null;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <DateChips today={today} days={OPEN_DAYS + 1} selected={selected} onSelect={setSelected} />
      <h2 className="font-semibold text-muted-foreground">{formatDateKey(selected, { weekday: true })}</h2>
      {rows.length === 0 ? (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarX2 aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('empty')}</EmptyTitle>
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
                closeMinutes={CLOSE_MINUTES}
                now={now}
                onOpen={() => setOpenId(row.session_id)}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">{tProto('unpublishedHidden')}</p>
      <BookingDrawer row={openRow} timezone={timezone} now={now} onClose={() => setOpenId(null)} />
    </div>
  );
}
