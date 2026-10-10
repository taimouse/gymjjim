/** 예약 엔진 (private.create_booking · promote_waitlist · cancel_booking) */
import { byId, nowIso, raise, type Row, table } from '../db';
import {
  ACTIVE_BOOKING,
  closeAt,
  deductPass,
  programCost,
  enqueue,
  freeCancelUntil,
  insert,
  localDate,
  me,
  ms,
  now,
  passError,
  pickPass,
  requireSession,
  restorePass,
  rules,
  sessionPayload,
  today,
  update,
  addDaysToKey,
} from './helpers';

export function createBooking(
  sessionId: unknown,
  memberId: unknown,
  passIdArg: unknown,
  bookedBy: 'member' | 'staff',
  byStaff: string | null,
  checkWindow: boolean,
  allowOver: boolean,
  waitlistIfFull: boolean,
): Row {
  const session = requireSession(sessionId);
  if (session.status === 'cancelled') raise('SESSION_CANCELLED');
  const date = localDate(session.starts_at);
  if (checkWindow) {
    if (now() >= closeAt(session)) raise('BOOKING_CLOSED');
    if (date > addDaysToKey(today(), rules().open_days_before)) raise('BOOKING_NOT_OPEN');
  }
  const mine = table('bookings').filter(
    (b) => b.member_id === memberId && ACTIVE_BOOKING.includes(String(b.status)),
  );
  if (mine.some((b) => b.session_id === session.id)) raise('ALREADY_BOOKED');
  const overlap = mine.some((b) => {
    const other = byId('sessions', b.session_id);
    return (
      !!other &&
      other.status === 'scheduled' &&
      !other.deleted_at &&
      ms(other.starts_at) < ms(session.ends_at) &&
      ms(other.ends_at) > ms(session.starts_at)
    );
  });
  if (overlap) raise('DUPLICATE_TIME');

  let passId = passIdArg as string | null;
  if (!passId) {
    const picked = pickPass(memberId, session, date);
    if (!picked.passId) raise(picked.error ?? 'NO_VALID_PASS');
    passId = picked.passId;
  }
  const pass = byId('member_passes', passId);
  if (!pass || pass.member_id !== memberId) raise('PASS_NOT_FOUND');
  const error = passError(pass, session, date);
  if (error) raise(error);

  let status: 'booked' | 'waitlisted';
  if (Number(session.booked_count) < Number(session.capacity) || allowOver) status = 'booked';
  else if (waitlistIfFull) status = 'waitlisted';
  else raise('SESSION_FULL');

  let deductedCount = 0;
  let position: number | null = null;
  if (status === 'booked') {
    deductedCount = deductPass(pass, programCost(session.program_id));
    update(session, { booked_count: Number(session.booked_count) + 1 });
  } else {
    const positions = table('bookings')
      .filter((b) => b.session_id === session.id && b.status === 'waitlisted')
      .map((b) => Number(b.waitlist_position));
    position = Math.max(0, ...positions) + 1;
    update(session, { waitlist_count: Number(session.waitlist_count) + 1 });
  }
  const booking = insert('bookings', {
    center_id: session.center_id,
    session_id: session.id,
    member_id: memberId,
    member_pass_id: pass.id,
    status,
    waitlist_position: position,
    pass_deducted: deductedCount > 0,
    deducted_count: deductedCount,
    booked_by: bookedBy,
    booked_by_staff_id: byStaff,
  });
  if (status === 'booked') {
    enqueue(
      memberId,
      'booking_confirmed',
      { ...sessionPayload(session), booking_id: booking.id },
      `booking_confirmed:${String(booking.id)}`,
    );
  }
  return {
    booking_id: booking.id,
    status,
    waitlist_position: position,
    member_pass_id: pass.id,
    deducted_count: deductedCount,
    remaining_count: pass.remaining_count,
  };
}

/** 취소가 나면 대기 1순위부터 자동 예약 */
export function promoteWaitlist(sessionId: unknown): string[] {
  const session = byId('sessions', sessionId);
  if (!session || session.status !== 'scheduled' || session.deleted_at) return [];
  if (now() >= closeAt(session)) return [];
  const date = localDate(session.starts_at);
  const promoted: string[] = [];
  while (Number(session.booked_count) < Number(session.capacity)) {
    const waiting = table('bookings')
      .filter((b) => b.session_id === session.id && b.status === 'waitlisted')
      .sort((a, b) => Number(a.waitlist_position) - Number(b.waitlist_position));
    const next = waiting[0];
    if (!next) break;
    let pass = next.member_pass_id ? byId('member_passes', next.member_pass_id) : undefined;
    if (!pass || passError(pass, session, date, next.id)) {
      const picked = pickPass(next.member_id, session, date, next.id);
      pass = picked.passId ? byId('member_passes', picked.passId) : undefined;
      if (pass && passError(pass, session, date, next.id)) pass = undefined;
    }
    for (const other of waiting.slice(1))
      update(other, { waitlist_position: Number(other.waitlist_position) - 1 });
    update(session, { waitlist_count: Math.max(0, Number(session.waitlist_count) - 1) });
    if (!pass) {
      update(next, {
        status: 'cancelled',
        waitlist_position: null,
        cancelled_at: nowIso(),
        cancel_reason: 'promotion_failed',
      });
      continue;
    }
    const deductedCount = deductPass(pass, programCost(session.program_id));
    update(next, {
      status: 'booked',
      waitlist_position: null,
      member_pass_id: pass.id,
      pass_deducted: deductedCount > 0,
      deducted_count: deductedCount,
      promoted_at: nowIso(),
    });
    update(session, { booked_count: Number(session.booked_count) + 1 });
    enqueue(
      next.member_id,
      'waitlist_promoted',
      { ...sessionPayload(session), booking_id: next.id },
      `waitlist_promoted:${String(next.id)}`,
    );
    promoted.push(String(next.id));
  }
  return promoted;
}

/** cancel_booking: 회원 본인(회원 화면) 또는 직원(관리자 화면) */
export function cancelBooking(bookingId: unknown, waive: boolean, asStaff: boolean): Row {
  const booking = byId('bookings', bookingId);
  if (!booking) raise('BOOKING_NOT_FOUND');
  const isMember = !asStaff && booking.member_id === me().id;
  if (!asStaff && !isMember) raise('BOOKING_NOT_FOUND');
  if (waive && !asStaff) raise('FORBIDDEN');
  const reason = isMember ? 'member' : 'staff';
  const session = requireSession(booking.session_id);
  if (!['booked', 'waitlisted'].includes(String(booking.status))) raise('BOOKING_NOT_CANCELLABLE');
  if (!asStaff && now() >= ms(session.starts_at)) raise('SESSION_STARTED');

  if (booking.status === 'waitlisted') {
    const position = Number(booking.waitlist_position);
    update(booking, {
      status: 'cancelled',
      waitlist_position: null,
      cancelled_at: nowIso(),
      cancel_reason: reason,
    });
    for (const other of table('bookings')) {
      if (
        other.session_id === session.id &&
        other.status === 'waitlisted' &&
        Number(other.waitlist_position) > position
      )
        update(other, { waitlist_position: Number(other.waitlist_position) - 1 });
    }
    update(session, { waitlist_count: Math.max(0, Number(session.waitlist_count) - 1) });
    return { booking_id: booking.id, status: 'cancelled', restored: false, promoted: [] };
  }

  const free = waive || now() <= freeCancelUntil(session);
  let restored = false;
  let deducted = booking.pass_deducted;
  let deductedCount = booking.deducted_count;
  if (free && booking.pass_deducted) {
    restorePass(booking.member_pass_id, booking.deducted_count);
    restored = true;
    deducted = false;
    deductedCount = 0;
  }
  const status = free ? 'cancelled' : 'late_cancelled';
  update(booking, {
    status,
    cancelled_at: nowIso(),
    cancel_reason: reason,
    pass_deducted: deducted,
    deducted_count: deductedCount,
  });
  update(session, { booked_count: Math.max(0, Number(session.booked_count) - 1) });
  const promoted = rules().auto_promote_waitlist ? promoteWaitlist(session.id) : [];
  return { booking_id: booking.id, status, restored, promoted };
}
