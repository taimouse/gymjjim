import type { ScheduleRow } from '@/features/booking/queries';
import type { CalendarSession } from '@/features/sessions/queries';
import { toDateKey } from '@/lib/format';

import { bookedCount, isPublished } from './store';
import type { ProtoSession, ProtoState } from './types';

/** 관리자 캘린더용 (실제 앱의 CalendarSession 모양) */
export function toCalendarSession(state: ProtoState, session: ProtoSession): CalendarSession {
  const program = state.programs.find((p) => p.id === session.program_id);
  const instructor = state.staff.find((s) => s.id === session.instructor_id);
  const mine = state.bookings.find((b) => b.session_id === session.id && b.status === 'waitlisted');
  return {
    id: session.id,
    starts_at: session.starts_at,
    ends_at: session.ends_at,
    capacity: session.capacity,
    booked_count: Math.min(session.capacity, bookedCount(state, session)),
    waitlist_count: mine ? 1 : 0,
    status: session.status,
    note: session.note,
    recurrence_group_id: session.recurrence_group_id,
    cancel_reason: null,
    publish_at: session.publish_at,
    program: program
      ? {
          id: program.id,
          name: program.name,
          color: program.color,
          duration_min: program.duration_min,
          publish_at: program.publish_at,
        }
      : null,
    instructor: instructor ?? null,
  };
}

/** 회원 시간표: 그날(센터 시간대)의 공개된 수업 + 내 예약 상태 (실제 앱의 member_schedule 과 같은 규칙) */
export function scheduleRows(state: ProtoState, dateKey: string, now: Date): ScheduleRow[] {
  return state.sessions
    .filter(
      (session) =>
        session.status === 'scheduled' &&
        toDateKey(session.starts_at, state.center.timezone) === dateKey &&
        isPublished(state, session, now.getTime()),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((session) => {
      const program = state.programs.find((p) => p.id === session.program_id);
      const booking = state.bookings.find((b) => b.session_id === session.id && b.status !== 'cancelled');
      return {
        session_id: session.id,
        starts_at: session.starts_at,
        ends_at: session.ends_at,
        program_id: session.program_id,
        program_name: program?.name ?? '',
        program_color: program?.color ?? '#E5E7EB',
        instructor_name: state.staff.find((s) => s.id === session.instructor_id)?.name ?? null,
        capacity: session.capacity,
        booked_count: Math.min(session.capacity, bookedCount(state, session)),
        waitlist_count: booking?.status === 'waitlisted' ? 1 : 0,
        my_booking_id: booking?.id ?? null,
        my_status: booking?.status ?? null,
        my_waitlist_position: booking?.waitlist_position ?? null,
        my_pass_type: booking ? 'period' : null,
      };
    });
}

/** 내 예약 (다가오는 것만, 시간순) */
export function upcomingBookings(state: ProtoState, now: Date) {
  return state.bookings
    .filter((b) => b.status !== 'cancelled')
    .map((booking) => ({ booking, session: state.sessions.find((s) => s.id === booking.session_id) }))
    .filter(
      (item): item is { booking: (typeof item)['booking']; session: ProtoSession } =>
        !!item.session && Date.parse(item.session.ends_at) > now.getTime(),
    )
    .sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at));
}
