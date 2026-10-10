/**
 * 예약 엔진 공용 규칙 (supabase/migrations 의 private.* 함수와 같은 동작)
 * pass_state · pass_error · pick_pass · deduct_pass · restore_pass · enqueue_notification · session_payload
 */
import { parseISO, startOfISOWeek } from 'date-fns';

import { parseBookingSettings } from '@/features/centers/schema';
import { addDaysToKey, toDateKey } from '@/lib/format';

import { byId, CENTER_ID, nowIso, raise, type Row, table, TIME_ZONE, uuid } from '../db';
import { applyDefaults } from '../defaults';
import { currentMember, currentStaff } from '../session';

export const ACTIVE_BOOKING = ['booked', 'waitlisted', 'attended', 'no_show'];

export const localDate = (iso: unknown) => toDateKey(String(iso), TIME_ZONE);
export const today = () => toDateKey(new Date(), TIME_ZONE);
export const now = () => Date.now();
export const ms = (iso: unknown) => Date.parse(String(iso));

export function rules() {
  const center = byId('centers', CENTER_ID)!;
  return parseBookingSettings(center.booking_settings);
}

export const closeAt = (session: Row) => ms(session.starts_at) - rules().close_minutes_before * 60_000;
export const freeCancelUntil = (session: Row) =>
  ms(session.starts_at) - rules().free_cancel_hours_before * 3_600_000;

export function insert(name: string, values: Row): Row {
  const row = applyDefaults(name, { id: uuid(), created_at: nowIso(), updated_at: nowIso(), ...values });
  table(name).push(row);
  return row;
}

export function update(row: Row, values: Row) {
  Object.assign(row, values, { updated_at: nowIso() });
}

export function isPublished(session: Row): boolean {
  const program = byId('programs', session.program_id);
  const own = !session.publish_at || ms(session.publish_at) <= now();
  return own && !(program?.publish_at && ms(program.publish_at) > now());
}

const holdsOf = (passId: unknown) => table('pass_holds').filter((hold) => hold.member_pass_id === passId);
const inHold = (passId: unknown, date: string) =>
  holdsOf(passId).some((hold) => String(hold.start_date) <= date && date <= String(hold.end_date));

export function passState(pass: Row, date = today()): string {
  if (pass.status !== 'active' || pass.deleted_at) return 'cancelled';
  if (String(pass.start_date) > date) return 'upcoming';
  if (pass.end_date && String(pass.end_date) < date) return 'expired';
  if (pass.remaining_count !== null && Number(pass.remaining_count) <= 0) return 'exhausted';
  if (inHold(pass.id, date)) return 'on_hold';
  return 'active';
}

function periodKey(date: string, unit: unknown): string {
  if (unit === 'month') return date.slice(0, 7);
  const monday = startOfISOWeek(parseISO(date));
  return `${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`;
}

export function passError(pass: Row, session: Row, date: string, excludeBookingId?: unknown): string | null {
  if (pass.status !== 'active' || pass.deleted_at) return 'NO_VALID_PASS';
  const allowed = table('program_allowed_products').some(
    (row) => row.program_id === session.program_id && row.product_id === pass.product_id && pass.product_id,
  );
  if (!allowed) return 'PASS_NOT_ALLOWED';
  if (String(pass.start_date) > date) return 'PASS_NOT_STARTED';
  if (pass.end_date && String(pass.end_date) < date) return 'PASS_EXPIRED';
  if (inHold(pass.id, date)) return 'PASS_ON_HOLD';
  if (pass.remaining_count !== null && Number(pass.remaining_count) <= 0) return 'PASS_EXHAUSTED';
  if (pass.remaining_count !== null && Number(pass.remaining_count) < programCost(session.program_id))
    return 'PASS_INSUFFICIENT';
  if (pass.period_limit_count !== null) {
    const key = periodKey(date, pass.period_limit_unit);
    const used = table('bookings').filter((booking) => {
      if (booking.member_pass_id !== pass.id || booking.id === excludeBookingId) return false;
      if (![...ACTIVE_BOOKING, 'late_cancelled'].includes(String(booking.status))) return false;
      const other = byId('sessions', booking.session_id);
      return !!other && periodKey(localDate(other.starts_at), pass.period_limit_unit) === key;
    }).length;
    if (used >= Number(pass.period_limit_count)) return 'PERIOD_LIMIT_REACHED';
  }
  return null;
}

const RANK: Record<string, number> = {
  PERIOD_LIMIT_REACHED: 1,
  PASS_ON_HOLD: 2,
  PASS_INSUFFICIENT: 3,
  PASS_EXHAUSTED: 3,
  PASS_EXPIRED: 4,
  PASS_NOT_STARTED: 5,
};

/** 만료 임박 순으로 쓸 수 있는 이용권 하나. 없으면 가장 알맞은 에러 코드 */
export function pickPass(
  memberId: unknown,
  session: Row,
  date: string,
  excludeBookingId?: unknown,
): { passId: string | null; error: string | null } {
  const candidates = table('member_passes')
    .filter((pass) => pass.member_id === memberId && pass.status === 'active' && !pass.deleted_at)
    .sort(
      (a, b) =>
        (a.end_date ? 0 : 1) - (b.end_date ? 0 : 1) ||
        String(a.end_date ?? '').localeCompare(String(b.end_date ?? '')) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    );
  let best: string | null = null;
  for (const pass of candidates) {
    const error = passError(pass, session, date, excludeBookingId);
    if (!error) return { passId: String(pass.id), error: null };
    if (best === null || (RANK[error] ?? 9) < (RANK[best] ?? 9)) best = error;
  }
  return { passId: null, error: !best || best === 'PASS_NOT_ALLOWED' ? 'NO_VALID_PASS' : best };
}

export function sessionPayload(session: Row): Row {
  const program = byId('programs', session.program_id);
  const instructor = byId('staff', session.instructor_id);
  const center = byId('centers', CENTER_ID)!;
  return {
    session_id: session.id,
    program_name: program?.name ?? '',
    starts_at: session.starts_at,
    ends_at: session.ends_at,
    timezone: center.timezone,
    center_name: center.name,
    instructor_name: instructor?.name ?? null,
  };
}

/** 알림 발송 대기열에 넣는다 (프로토타입은 실제로 보내지 않고 "발송"으로 기록) */
export function enqueue(
  memberId: unknown,
  type: string,
  payload: Row,
  dedupeKey: string | null,
  force = false,
) {
  if (dedupeKey && table('notification_logs').some((log) => log.dedupe_key === dedupeKey)) return;
  const member = byId('members', memberId);
  const send =
    !!member && member.status === 'active' && !member.deleted_at && (force || !!member.notify_enabled);
  insert('notification_logs', {
    center_id: CENTER_ID,
    member_id: memberId,
    type,
    template_code: type.toUpperCase(),
    payload,
    dedupe_key: dedupeKey,
    status: send ? 'sent' : 'skipped',
    error: send ? null : 'NOTIFY_DISABLED',
    provider: send ? 'mock' : null,
    attempts: send ? 1 : 0,
    sent_at: send ? nowIso() : null,
  });
}

/** 프로그램의 횟수권 차감 횟수 (없으면 1) */
export function programCost(programId: unknown): number {
  return Number(byId('programs', programId)?.pass_cost ?? 1);
}

/** 횟수권에서 count 회 차감. 차감한 횟수를 돌려준다 (기간권은 0) */
export function deductPass(pass: Row, count: number): number {
  if (pass.remaining_count === null) return 0;
  if (Number(pass.remaining_count) <= 0) raise('PASS_EXHAUSTED');
  if (Number(pass.remaining_count) < count) raise('PASS_INSUFFICIENT');
  update(pass, { remaining_count: Number(pass.remaining_count) - count });
  if (pass.remaining_count === 1) {
    enqueue(
      pass.member_id,
      'pass_remaining_one',
      { member_pass_id: pass.id, pass_name: pass.name, remaining_count: 1, end_date: pass.end_date },
      `pass_remaining_one:${String(pass.id)}`,
    );
  }
  return count;
}

/** 차감했던 count 회를 되돌린다 (총 횟수를 넘지 않게) */
export function restorePass(passId: unknown, count: unknown) {
  const pass = byId('member_passes', passId);
  if (!pass || pass.remaining_count === null) return;
  update(pass, {
    remaining_count: Math.min(
      Number(pass.remaining_count) + Math.max(Number(count) || 0, 0),
      Number(pass.total_count),
    ),
  });
}

export const me = () => currentMember();
export const staffId = () => String(currentStaff().id);
export const isOwner = () => currentStaff().role === 'owner';

export function requireSession(id: unknown): Row {
  const session = byId('sessions', id);
  if (!session || session.deleted_at) raise('SESSION_NOT_FOUND');
  return session;
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
export { addDaysToKey };
