/**
 * 수업 상태 (CLAUDE.md 7번: 색 + 텍스트로 함께 표시)
 * 예약가능(open) / 마감임박(almost) / 대기가능(waitlist) / 마감(closed) / 종료(ended) + 폐강(cancelled)
 */
export type SessionAvailability = 'open' | 'almost' | 'waitlist' | 'closed' | 'ended' | 'cancelled';

export interface SessionLike {
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  status: 'scheduled' | 'cancelled';
}

export function remainingSeats(session: Pick<SessionLike, 'capacity' | 'booked_count'>): number {
  return Math.max(0, session.capacity - session.booked_count);
}

/** 남은 자리가 2자리 이하이거나 정원의 20% 이하면 마감임박 */
export function isAlmostFull(session: Pick<SessionLike, 'capacity' | 'booked_count'>): boolean {
  const left = remainingSeats(session);
  return left > 0 && left <= Math.max(2, Math.ceil(session.capacity * 0.2));
}

export function sessionAvailability(
  session: SessionLike,
  closeMinutesBefore: number,
  now: Date = new Date(),
): SessionAvailability {
  if (session.status === 'cancelled') return 'cancelled';
  const nowMs = now.getTime();
  if (nowMs >= Date.parse(session.ends_at)) return 'ended';
  if (nowMs >= Date.parse(session.starts_at) - closeMinutesBefore * 60_000) return 'closed';
  if (remainingSeats(session) === 0) return 'waitlist';
  if (isAlmostFull(session)) return 'almost';
  return 'open';
}

export const AVAILABILITY_TONE = {
  open: 'success',
  almost: 'warning',
  waitlist: 'info',
  closed: 'danger',
  ended: 'muted',
  cancelled: 'muted',
} as const satisfies Record<SessionAvailability, 'success' | 'warning' | 'info' | 'danger' | 'muted'>;
