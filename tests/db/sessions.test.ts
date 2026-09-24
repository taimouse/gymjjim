import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createSession } from './factories';
import { query, queryOne, rpc, rpcError } from './helpers';
import {
  addMember,
  type BookResult,
  bookingStatus,
  notifications,
  sessionCounts,
  setupScenario,
} from './scenario';

async function recurringSessions(centerId: string, programId: string, count: number) {
  const groupId = randomUUID();
  const ids: string[] = [];
  for (let week = 0; week < count; week += 1) {
    const id = await createSession(centerId, programId, { startsInMinutes: 24 * 60 + week * 7 * 24 * 60 });
    await query(`update public.sessions set recurrence_group_id = $1 where id = $2`, [groupId, id]);
    ids.push(id);
  }
  return ids;
}

describe('update_session', () => {
  it('이 수업만 30분 뒤로 옮기고, 원하면 예약자에게 알림을 보낸다', async () => {
    const scenario = await setupScenario();
    const [first, second] = await recurringSessions(scenario.centerId, scenario.programId, 2);
    const member = await addMember(scenario);
    await rpc(member.userId, 'book_session', { p_session_id: first });
    const before = await queryOne<{ starts_at: Date; ends_at: Date }>(
      `select starts_at, ends_at from public.sessions where id = $1`,
      [first],
    );
    const startsAt = new Date(before.starts_at.getTime() + 30 * 60_000).toISOString();
    const endsAt = new Date(before.ends_at.getTime() + 30 * 60_000).toISOString();

    const result = await rpc(scenario.staff.userId, 'update_session', {
      p_session_id: first,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_notify: true,
    });
    expect(result).toEqual({ updated: 1, notified: 1 });
    const other = await queryOne<{ moved: boolean }>(
      `select starts_at > now() + interval '7 days' as moved from public.sessions where id = $1`,
      [second],
    );
    expect(other.moved).toBe(true);
    // 변경 알림은 알림 끄기와 관계없이 발송
    expect(await notifications(member.id, 'session_changed')).toEqual([
      { type: 'session_changed', status: 'pending' },
    ]);
  });

  it('이후 전체: 같은 반복 묶음의 이후 수업에 같은 이동 폭과 정원을 적용한다', async () => {
    const scenario = await setupScenario();
    const ids = await recurringSessions(scenario.centerId, scenario.programId, 3);
    const rows = await query<{ id: string; starts_at: Date; ends_at: Date }>(
      `select id, starts_at, ends_at from public.sessions where id = any($1) order by starts_at`,
      [ids],
    );
    const base = rows[1]!;
    const result = await rpc(scenario.staff.userId, 'update_session', {
      p_session_id: base.id,
      p_scope: 'following',
      p_starts_at: new Date(base.starts_at.getTime() + 60 * 60_000).toISOString(),
      p_ends_at: new Date(base.starts_at.getTime() + 150 * 60_000).toISOString(),
      p_capacity: 20,
    });
    expect(result).toEqual({ updated: 2, notified: 0 });
    const after = await query<{ id: string; shift: number; minutes: number; capacity: number }>(
      `select s.id, extract(epoch from s.starts_at - o.starts_at)::int / 60 as shift,
              extract(epoch from s.ends_at - s.starts_at)::int / 60 as minutes, s.capacity
       from public.sessions s join unnest($1::uuid[], $2::timestamptz[]) as o(id, starts_at) on o.id = s.id
       order by o.starts_at`,
      [rows.map((row) => row.id), rows.map((row) => row.starts_at.toISOString())],
    );
    expect(after.map((row) => row.shift)).toEqual([0, 60, 60]);
    expect(after.map((row) => row.minutes)).toEqual([60, 90, 90]);
    expect(after.map((row) => row.capacity)).toEqual([10, 20, 20]);
  });

  it('정원을 늘리면 대기자가 자동 승격된다', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { capacity: 1 });
    const [a, b] = await Promise.all([addMember(scenario), addMember(scenario)]);
    await rpc(a.userId, 'book_session', { p_session_id: sessionId });
    const waiting = await rpc<BookResult>(b.userId, 'book_session', { p_session_id: sessionId });
    await rpc(scenario.staff.userId, 'update_session', { p_session_id: sessionId, p_capacity: 2 });
    expect((await bookingStatus(waiting.booking_id)).status).toBe('booked');
    expect(await sessionCounts(sessionId)).toEqual({ booked_count: 2, waitlist_count: 0 });
  });

  it('회원·다른 센터 직원은 수정할 수 없다', async () => {
    const scenario = await setupScenario();
    const other = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    const args = { p_session_id: sessionId, p_capacity: 5 };
    expect(await rpcError(member.userId, 'update_session', args)).toBe('FORBIDDEN');
    expect(await rpcError(other.staff.userId, 'update_session', args)).toBe('FORBIDDEN');
  });
});
