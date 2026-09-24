'use client';

import FullCalendar, {
  type DateSelectInfo,
  type DatesSetInfo,
  type EventClickInfo,
  type EventDisplayInfo,
  type EventDropInfo,
  type EventInput,
  type EventResizeDoneInfo,
  useCalendarController,
} from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import koLocale from '@fullcalendar/react/locales/ko';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { CalendarSession } from '@/features/sessions/queries';
import { cn } from '@/lib/utils';

const VIEWS = ['timeGridWeek', 'timeGridDay', 'dayGridMonth'] as const;
const EVENT_TEXT = '#1f2937';

export interface MoveRequest {
  session: CalendarSession;
  startsAt: string;
  endsAt: string;
  revert: () => void;
}

function SessionEventContent({ session, compact }: { session: CalendarSession; compact: boolean }) {
  const t = useTranslations('calendar.event');
  const full = session.booked_count >= session.capacity;
  const counts =
    session.status === 'cancelled'
      ? t('cancelled')
      : full
        ? t('full', { booked: session.booked_count, capacity: session.capacity })
        : t('counts', { booked: session.booked_count, capacity: session.capacity });
  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col overflow-hidden border-l-4 px-1.5 py-0.5 text-[13px] leading-snug',
        session.status === 'cancelled' && 'line-through opacity-60',
      )}
      style={{ borderLeftColor: session.instructor?.color ?? 'transparent' }}
    >
      <span className="truncate font-semibold">{session.program?.name}</span>
      <span className={cn('truncate', full && session.status !== 'cancelled' && 'font-semibold text-danger')}>
        {counts}
        {session.waitlist_count > 0 && ` · ${t('waitlist', { count: session.waitlist_count })}`}
      </span>
      {!compact && session.instructor && (
        <span className="truncate opacity-75">{session.instructor.name}</span>
      )}
    </div>
  );
}

/** FullCalendar v7 (MIT 플러그인만: daygrid · timegrid · interaction) */
export function AdminCalendar({
  sessions,
  timezone,
  onRangeChange,
  onSelectSlot,
  onOpenSession,
  onMoveSession,
}: {
  sessions: CalendarSession[];
  timezone: string;
  onRangeChange: (from: string, to: string) => void;
  onSelectSlot: (start: Date, end: Date, allDay: boolean) => void;
  onOpenSession: (sessionId: string) => void;
  onMoveSession: (request: MoveRequest) => void;
}) {
  const t = useTranslations('calendar');
  const controller = useCalendarController();
  const byId = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  const [nowMs] = useState(() => Date.now());

  const events = useMemo<EventInput[]>(
    () =>
      sessions.map((session) => ({
        id: session.id,
        title: session.program?.name ?? '',
        start: session.starts_at,
        end: session.ends_at,
        color: session.program?.color ?? '#E5E7EB',
        contrastColor: EVENT_TEXT,
        editable: session.status === 'scheduled' && Date.parse(session.starts_at) > nowMs,
      })),
    [sessions, nowMs],
  );

  const move = (info: EventDropInfo | EventResizeDoneInfo) => {
    const session = byId.get(info.event.id);
    const { start, end } = info.event;
    if (!session || !start || !end) return info.revert();
    onMoveSession({ session, startsAt: start.toISOString(), endsAt: end.toISOString(), revert: info.revert });
  };

  return (
    <div className="gj-calendar space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => controller.today()}>
          {t('today')}
        </Button>
        <div className="flex">
          <Button variant="ghost" size="icon" aria-label={t('prev')} onClick={() => controller.prev()}>
            <ChevronLeft aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t('next')} onClick={() => controller.next()}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <h2 className="text-lg font-bold" aria-live="polite">
          {controller.view?.title}
        </h2>
        <ToggleGroup
          type="single"
          variant="outline"
          value={controller.view?.type ?? 'timeGridWeek'}
          onValueChange={(value) => value && controller.changeView(value)}
          className="ml-auto"
        >
          {VIEWS.map((view) => (
            <ToggleGroupItem key={view} value={view} className="h-10 px-4">
              {t(`views.${view}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <FullCalendar
          controller={controller}
          plugins={[classicThemePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={false}
          locale={koLocale}
          timeZone={timezone}
          firstDay={1}
          slotMinTime="06:00:00"
          slotMaxTime="23:30:00"
          scrollTime="07:00:00"
          slotDuration="00:30:00"
          nowIndicator
          allDaySlot={false}
          height={760}
          selectable
          selectMirror
          editable
          eventDurationEditable
          dayMaxEvents={4}
          events={events}
          eventContent={(arg: EventDisplayInfo) => {
            const session = byId.get(arg.event.id);
            return session ? (
              <SessionEventContent session={session} compact={controller.view?.type === 'dayGridMonth'} />
            ) : null;
          }}
          select={(info: DateSelectInfo) => {
            onSelectSlot(info.start, info.end, info.allDay);
            info.view.calendar.unselect();
          }}
          eventClick={(info: EventClickInfo) => {
            info.jsEvent.preventDefault();
            onOpenSession(info.event.id);
          }}
          eventDrop={move}
          eventResize={move}
          datesSet={(info: DatesSetInfo) => onRangeChange(info.start.toISOString(), info.end.toISOString())}
        />
      </div>
    </div>
  );
}
