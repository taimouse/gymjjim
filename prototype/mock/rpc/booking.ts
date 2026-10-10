/** 예약 RPC (20260925001100_booking_rpc · 001200_cancel_promote · 001300_attendance) */
import { byId, nowIso, raise, type Row, table } from '../db';
import { cancelBooking, createBooking } from './engine';
import {
  closeAt,
  enqueue,
  freeCancelUntil,
  isPublished,
  localDate,
  me,
  ms,
  now,
  pickPass,
  requireSession,
  restorePass,
  sessionPayload,
  staffId,
  update,
} from './helpers';

type Args = Record<string, unknown>;

/** 관리자 화면에서 부르는지: 회원 화면(/m)이 아니면 직원 권한으로 본다 */
const fromAdmin = () => typeof window !== 'undefined' && !window.location.pathname.includes('/m/');

export const bookingRpcs = {
  book_session: {
    mutates: ['bookings', 'sessions', 'member_passes', 'notification_logs'],
    run: (a: Args) => {
      const session = requireSession(a.p_session_id);
      if (!isPublished(session)) raise('BOOKING_NOT_OPEN');
      return createBooking(
        session.id,
        me().id,
        a.p_member_pass_id ?? null,
        'member',
        null,
        true,
        false,
        true,
      );
    },
  },
  staff_book_for_member: {
    mutates: ['bookings', 'sessions', 'member_passes', 'notification_logs'],
    run: (a: Args) => {
      requireSession(a.p_session_id);
      const member = byId('members', a.p_member_id);
      if (!member || member.status !== 'active' || member.deleted_at) raise('MEMBER_NOT_FOUND');
      return createBooking(
        a.p_session_id,
        member.id,
        a.p_member_pass_id ?? null,
        'staff',
        staffId(),
        !a.p_override_rules,
        !!a.p_allow_over_capacity,
        !!a.p_waitlist,
      );
    },
  },
  preview_booking: {
    mutates: [],
    run: (a: Args) => {
      const session = requireSession(a.p_session_id);
      if (!isPublished(session)) raise('SESSION_NOT_FOUND');
      const picked = pickPass(me().id, session, localDate(session.starts_at));
      const pass = picked.passId ? byId('member_passes', picked.passId) : null;
      return {
        pass: pass
          ? {
              id: pass.id,
              name: pass.name,
              type: pass.type,
              remaining_count: pass.remaining_count,
              end_date: pass.end_date,
            }
          : null,
        error: picked.error,
        free_cancel_until: new Date(freeCancelUntil(session)).toISOString(),
        close_at: new Date(closeAt(session)).toISOString(),
      };
    },
  },
  cancel_booking: {
    mutates: ['bookings', 'sessions', 'member_passes', 'notification_logs'],
    run: (a: Args) => cancelBooking(a.p_booking_id, !!a.p_waive_penalty, fromAdmin()),
  },
  set_attendance: {
    mutates: ['bookings'],
    run: (a: Args) => {
      if (!['attended', 'no_show', 'booked'].includes(String(a.p_status))) raise('INVALID_STATUS');
      const booking = byId('bookings', a.p_booking_id);
      if (!booking) raise('BOOKING_NOT_FOUND');
      const previous = booking.status;
      if (!['booked', 'attended', 'no_show'].includes(String(previous))) raise('INVALID_STATUS');
      update(booking, {
        status: a.p_status,
        attended_at: a.p_status === 'attended' ? (booking.attended_at ?? nowIso()) : null,
      });
      return { booking_id: booking.id, status: a.p_status, previous_status: previous };
    },
  },
  cancel_session: {
    mutates: ['bookings', 'sessions', 'member_passes', 'notification_logs'],
    run: (a: Args) => {
      const session = requireSession(a.p_session_id);
      if (session.status === 'cancelled') raise('SESSION_CANCELLED');
      if (now() >= ms(session.ends_at)) raise('SESSION_ENDED');
      const payload = { ...sessionPayload(session), reason: a.p_reason ?? null };
      const affected: Row[] = [];
      let restoredCount = 0;
      for (const booking of table('bookings')) {
        if (booking.session_id !== session.id || !['booked', 'waitlisted'].includes(String(booking.status)))
          continue;
        if (booking.pass_deducted) {
          restorePass(booking.member_pass_id);
          restoredCount += 1;
        }
        const previous = booking.status;
        update(booking, {
          status: 'cancelled',
          waitlist_position: null,
          pass_deducted: false,
          cancelled_at: nowIso(),
          cancel_reason: 'session_cancelled',
        });
        enqueue(
          booking.member_id,
          'session_cancelled',
          { ...payload, booking_id: booking.id },
          `session_cancelled:${String(booking.id)}`,
          true,
        );
        affected.push({
          booking_id: booking.id,
          member_id: booking.member_id,
          member_name: byId('members', booking.member_id)?.name ?? null,
          previous_status: previous,
        });
      }
      update(session, {
        status: 'cancelled',
        cancelled_at: nowIso(),
        cancel_reason: a.p_reason ?? null,
        waitlist_count: 0,
        booked_count: table('bookings').filter(
          (b) => b.session_id === session.id && ['booked', 'attended', 'no_show'].includes(String(b.status)),
        ).length,
      });
      return { session_id: session.id, affected, restored_count: restoredCount };
    },
  },
};
