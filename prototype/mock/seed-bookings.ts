/** 예약 이력 시드 (seed/30_bookings.sql 과 같은 규칙) */
import { startOfISOWeek } from 'date-fns';

import { toDateKey } from '@/lib/format';

import type { Row } from './db';
import { applyDefaults } from './defaults';

const TZ = 'Asia/Seoul';
const CENTER = 'c0000000-0000-4000-8000-000000000001';
const id = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const memberId = (n: number) => id('d', n);
const programId = (n: number) => id('f', n);
const row = (table: string, values: Row) => applyDefaults(table, values);

/** 결정적 해시 (시드가 매번 같게) */
function hash(text: string): number {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return Math.abs(h);
}

/** seed/30_bookings.sql 과 같은 규칙으로 예약 이력을 만든다 (지난 수업 출석·노쇼, 다가오는 수업 예약·대기) */
export function seedBookings(input: {
  sessions: Row[];
  passes: Row[];
  holds: Row[];
  allowed: Row[];
  programs: Row[];
  now: Date;
}): Row[] {
  const { sessions, passes, holds, allowed, programs, now } = input;
  // 홍길동(1)은 예약 이력 없이 횟수권 20회로 시작한다
  const skip = new Set([memberId(1), memberId(2), memberId(7), memberId(19)]);
  const wod = programId(2);
  const full = sessions.find(
    (s) => s.program_id === wod && Date.parse(String(s.starts_at)) > now.getTime() + 20 * 3_600_000,
  );
  if (full) full.capacity = 8;
  const bookings: Row[] = [];
  const usedOf = (passId: unknown) =>
    bookings
      .filter((b) => b.member_pass_id === passId)
      .reduce((sum, b) => sum + Number(b.deducted_count ?? 0), 0);

  for (const session of sessions) {
    const date = toDateKey(String(session.starts_at), TZ);
    const program = programs.find((p) => p.id === session.program_id)!;
    const rate = session === full || program.type === 'private' ? 100 : 50;
    const productIds = new Set(
      allowed.filter((a) => a.program_id === session.program_id).map((a) => a.product_id),
    );
    const candidates = new Map<string, Row>();
    for (const pass of [...passes].sort((a, b) =>
      String(a.end_date ?? '9999').localeCompare(String(b.end_date ?? '9999')),
    )) {
      const member = String(pass.member_id);
      if (candidates.has(member) || skip.has(member) || !productIds.has(pass.product_id)) continue;
      if (String(pass.start_date) > date || (pass.end_date && String(pass.end_date) < date)) continue;
      if (holds.some((h) => h.member_pass_id === pass.id && h.start_date! <= date && date <= h.end_date!))
        continue;
      if (hash(`${String(session.id)}${member}`) % 100 >= rate) continue;
      candidates.set(member, pass);
    }
    let booked = 0;
    let waitlist = 0;
    for (const [member, pass] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
      const cost = Number(program.pass_cost ?? 1);
      if (pass.remaining_count !== null && Number(pass.remaining_count) < usedOf(pass.id) + cost) continue;
      const overlap = bookings.some((b) => {
        const other = sessions.find((s) => s.id === b.session_id)!;
        return (
          b.member_id === member && other.starts_at! < session.ends_at! && other.ends_at! > session.starts_at!
        );
      });
      if (overlap) continue;
      if (pass.period_limit_count !== null) {
        const week = startOfISOWeek(new Date(`${date}T00:00:00`)).getTime();
        const used = bookings.filter((b) => {
          const other = sessions.find((s) => s.id === b.session_id)!;
          return (
            b.member_pass_id === pass.id &&
            startOfISOWeek(new Date(`${toDateKey(String(other.starts_at), TZ)}T00:00:00`)).getTime() === week
          );
        }).length;
        if (used >= Number(pass.period_limit_count)) continue;
      }
      const ended = Date.parse(String(session.ends_at)) <= now.getTime();
      const createdAt = new Date(
        Math.min(now.getTime(), Date.parse(String(session.starts_at)) - 86_400_000),
      ).toISOString();
      if (booked < Number(session.capacity)) {
        const status = !ended
          ? 'booked'
          : hash(`${member}${String(session.id)}`) % 10 === 0
            ? 'no_show'
            : 'attended';
        bookings.push(
          row('bookings', {
            id: crypto.randomUUID(),
            center_id: CENTER,
            session_id: session.id,
            member_id: member,
            member_pass_id: pass.id,
            status,
            pass_deducted: pass.type !== 'period',
            deducted_count: pass.type !== 'period' ? cost : 0,
            attended_at: status === 'attended' ? session.starts_at : null,
            created_at: createdAt,
            updated_at: createdAt,
          }),
        );
        booked += 1;
      } else if (!ended && waitlist < 3) {
        waitlist += 1;
        bookings.push(
          row('bookings', {
            id: crypto.randomUUID(),
            center_id: CENTER,
            session_id: session.id,
            member_id: member,
            member_pass_id: pass.id,
            status: 'waitlisted',
            waitlist_position: waitlist,
            created_at: createdAt,
            updated_at: createdAt,
          }),
        );
      }
    }
  }

  // 취소 예시: 다가오는 예약 2건 무료 취소, 1건 늦은 취소
  const upcoming = bookings.filter((b) => {
    const s = sessions.find((x) => x.id === b.session_id)!;
    return (
      b.status === 'booked' && s !== full && Date.parse(String(s.starts_at)) > now.getTime() + 4 * 3_600_000
    );
  });
  upcoming.slice(0, 3).forEach((b, i) => {
    Object.assign(b, {
      status: i < 2 ? 'cancelled' : 'late_cancelled',
      pass_deducted: i < 2 ? false : b.pass_deducted,
      deducted_count: i < 2 ? 0 : b.deducted_count,
      cancelled_at: new Date(now.getTime() - 2 * 3_600_000).toISOString(),
      cancel_reason: 'member',
    });
  });

  // 카운터·잔여 횟수 다시 계산
  for (const s of sessions) {
    s.booked_count = bookings.filter(
      (b) => b.session_id === s.id && ['booked', 'attended', 'no_show'].includes(String(b.status)),
    ).length;
    s.waitlist_count = bookings.filter((b) => b.session_id === s.id && b.status === 'waitlisted').length;
  }
  for (const p of passes) {
    if (p.remaining_count !== null) p.remaining_count = Number(p.remaining_count) - usedOf(p.id);
  }
  return bookings;
}
