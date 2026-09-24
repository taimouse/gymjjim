'use client';

import { Plus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { PageHeader } from '@/components/admin/page-header';
import { useSessionDrawer } from '@/components/admin/sessions/use-session-drawer';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useProgramsQuery } from '@/features/programs/queries';
import { useSessionsInRange } from '@/features/sessions/queries';
import { useStaffQuery } from '@/features/staff/queries';
import { todayKey, toDateKey, toTimeKey } from '@/lib/format';

import type { MoveRequest } from './admin-calendar';
import { MoveSessionDialog } from './move-session-dialog';
import { type CreateDefaults, SessionCreateSheet } from './session-create-sheet';

// FullCalendar 는 현재 시각에 따라 화면이 달라져 서버·클라이언트 HTML 이 어긋나므로 클라이언트에서만 그린다
const AdminCalendar = dynamic(() => import('./admin-calendar').then((module) => module.AdminCalendar), {
  ssr: false,
  loading: () => <Skeleton className="h-[820px] rounded-xl" />,
});

const ALL = 'all';

/** 관리자 캘린더: 주간 기본, 강사·프로그램 필터, 드래그로 수업 생성·이동, 클릭 → 세션 드로어 */
export function CalendarView() {
  const t = useTranslations('calendar');
  const { centerId, timezone } = useAdmin();
  const sessionDrawer = useSessionDrawer();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [instructorId, setInstructorId] = useState(ALL);
  const [programId, setProgramId] = useState(ALL);
  const [creating, setCreating] = useState<CreateDefaults | null>(null);
  const [moving, setMoving] = useState<MoveRequest | null>(null);
  const sessions = useSessionsInRange(centerId, range?.from ?? null, range?.to ?? null);
  const staff = useStaffQuery(centerId);
  const programs = useProgramsQuery(centerId);

  const filtered = useMemo(
    () =>
      (sessions.data ?? []).filter(
        (session) =>
          (instructorId === ALL || session.instructor?.id === instructorId) &&
          (programId === ALL || session.program?.id === programId),
      ),
    [sessions.data, instructorId, programId],
  );

  const createFromSlot = (start: Date, end: Date, allDay: boolean) =>
    setCreating({
      date: toDateKey(start, timezone),
      startTime: allDay ? '10:00' : toTimeKey(start, timezone),
      durationMin: allDay ? null : Math.round((end.getTime() - start.getTime()) / 60_000),
    });

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
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={instructorId} onValueChange={setInstructorId}>
          <SelectTrigger className="w-44" aria-label={t('filters.instructor')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.allInstructors')}</SelectItem>
            {(staff.data ?? []).map((member) => (
              <SelectItem key={member.id} value={member.id}>
                <span className="size-3 rounded-full" style={{ backgroundColor: member.color }} />
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={programId} onValueChange={setProgramId}>
          <SelectTrigger className="w-48" aria-label={t('filters.program')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.allPrograms')}</SelectItem>
            {(programs.data ?? []).map((program) => (
              <SelectItem key={program.id} value={program.id}>
                <span className="size-3 rounded-full" style={{ backgroundColor: program.color }} />
                {program.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(instructorId !== ALL || programId !== ALL) && (
          <Button
            variant="ghost"
            onClick={() => {
              setInstructorId(ALL);
              setProgramId(ALL);
            }}
          >
            {t('filters.reset')}
          </Button>
        )}
      </div>

      <AdminCalendar
        sessions={filtered}
        timezone={timezone}
        onRangeChange={(from, to) =>
          setRange((current) => (current?.from === from && current.to === to ? current : { from, to }))
        }
        onSelectSlot={createFromSlot}
        onOpenSession={sessionDrawer.open}
        onMoveSession={setMoving}
      />

      {creating && <SessionCreateSheet defaults={creating} onClose={() => setCreating(null)} />}
      {moving && <MoveSessionDialog request={moving} onDone={() => setMoving(null)} />}
    </>
  );
}
