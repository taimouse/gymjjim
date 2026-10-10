'use client';

import { Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { todayKey, toDateKey, toTimeKey } from '@/lib/format';

import { type CreateDefaults, SessionCreateSheet } from '../../components/session-create-sheet';
import { SessionDrawer } from '../../components/session-drawer';
import { toCalendarSession } from '../../lib/selectors';
import { protoActions, useProtoState } from '../../lib/store';

// 실제 앱의 FullCalendar 화면을 그대로 쓴다
const AdminCalendar = dynamic(
  () => import('@/components/admin/calendar/admin-calendar').then((module) => module.AdminCalendar),
  { ssr: false, loading: () => <Skeleton className="h-[820px] rounded-xl" /> },
);

/** 캘린더: 빈 시간 드래그·버튼으로 수업 만들기, 드래그로 옮기기, 눌러서 공개 상태 보기 */
export default function CalendarPage() {
  const t = useTranslations('calendar');
  const tProto = useTranslations('prototype.admin');
  const state = useProtoState();
  const [creating, setCreating] = useState<CreateDefaults | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  if (!state) return null;
  const timezone = state.center.timezone;
  const sessions = state.sessions.map((session) => toCalendarSession(state, session));

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('dragHint')}
        actions={
          <Button
            onClick={() => setCreating({ date: todayKey(timezone), startTime: '10:00', durationMin: null })}
          >
            <Plus aria-hidden />
            {t('newSession')}
          </Button>
        }
      />
      <AdminCalendar
        sessions={sessions}
        timezone={timezone}
        onRangeChange={() => undefined}
        onSelectSlot={(start, end, allDay) =>
          setCreating({
            date: toDateKey(start, timezone),
            startTime: allDay ? '10:00' : toTimeKey(start, timezone),
            durationMin: allDay ? null : Math.round((end.getTime() - start.getTime()) / 60_000),
          })
        }
        onOpenSession={setOpenId}
        onMoveSession={({ session, startsAt, endsAt }) => {
          protoActions.moveSession(session.id, startsAt, endsAt);
          toast.success(tProto('moved'));
        }}
      />
      {creating && <SessionCreateSheet state={state} defaults={creating} onClose={() => setCreating(null)} />}
      {openId && <SessionDrawer state={state} sessionId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
