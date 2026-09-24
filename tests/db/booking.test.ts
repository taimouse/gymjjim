import { describe, expect, it } from 'vitest';

import { createProduct, createSession } from './factories';
import { query, rpc, rpcError } from './helpers';
import {
  addMember,
  type BookResult,
  createSessionAt,
  notifications,
  remaining,
  sessionCounts,
  setupScenario,
} from './scenario';

describe('book_session 동시성', () => {
  it('정원 10명 수업에 15명이 동시에 예약하면 booked 10, waitlisted 5, 정원 초과 0', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { capacity: 10 });
    const members = await Promise.all(Array.from({ length: 15 }, () => addMember(scenario)));

    const results = await Promise.all(
      members.map((m) => rpc<BookResult>(m.userId, 'book_session', { p_session_id: sessionId })),
    );

    expect(results.filter((r) => r.status === 'booked')).toHaveLength(10);
    const waitlisted = results.filter((r) => r.status === 'waitlisted');
    expect(waitlisted).toHaveLength(5);
    expect(waitlisted.map((r) => r.waitlist_position).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(await sessionCounts(sessionId)).toEqual({ booked_count: 10, waitlist_count: 5 });

    const [row] = await query<{ booked: number }>(
      `select count(*)::int as booked from public.bookings where session_id = $1 and status = 'booked'`,
      [sessionId],
    );
    expect(row!.booked).toBe(10);
    // 대기는 차감하지 않는다
    const deducted = await Promise.all(members.map((m) => remaining(m.passId)));
    expect(deducted.filter((n) => n === 9)).toHaveLength(10);
    expect(deducted.filter((n) => n === 10)).toHaveLength(5);
  });
});

describe('book_session 규칙', () => {
  it('예약하면 1회 차감하고 확정 알림을 쌓는다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    const result = await rpc<BookResult>(member.userId, 'book_session', { p_session_id: sessionId });
    expect(result).toMatchObject({ status: 'booked', member_pass_id: member.passId, remaining_count: 9 });
    expect(await notifications(member.id, 'booking_confirmed')).toEqual([
      { type: 'booking_confirmed', status: 'pending' },
    ]);
  });

  it('이용권은 만료 임박 순으로 자동 선택한다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario, { endOffset: 40 });
    const soon = await addMember(scenario, { endOffset: 10 });
    await query(`update public.member_passes set member_id = $1 where id = $2`, [member.id, soon.passId]);
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    const result = await rpc<BookResult>(member.userId, 'book_session', { p_session_id: sessionId });
    expect(result.member_pass_id).toBe(soon.passId);
  });

  it('예약 오픈(7일) 전에는 거부한다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario, { endOffset: 60 });
    const sessionId = await createSessionAt(scenario, { dayOffset: 8, localTime: '10:00' });
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessionId })).toBe(
      'BOOKING_NOT_OPEN',
    );
  });

  it('예약 마감(시작 30분 전) 이후에는 거부한다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSession(scenario.centerId, scenario.programId, { startsInMinutes: 20 });
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessionId })).toBe('BOOKING_CLOSED');
  });

  it('시간이 겹치는 예약은 거부한다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const first = await createSession(scenario.centerId, scenario.programId, { startsInMinutes: 24 * 60 });
    const overlap = await createSession(scenario.centerId, scenario.programId, {
      startsInMinutes: 24 * 60 + 30,
    });
    await rpc(member.userId, 'book_session', { p_session_id: first });
    expect(await rpcError(member.userId, 'book_session', { p_session_id: overlap })).toBe('DUPLICATE_TIME');
    expect(await rpcError(member.userId, 'book_session', { p_session_id: first })).toBe('ALREADY_BOOKED');
  });

  it('정지 중인 이용권으로는 예약할 수 없다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    await query(
      `insert into public.pass_holds (center_id, member_pass_id, start_date, end_date)
       values ($1, $2, (now() at time zone 'Asia/Seoul')::date, (now() at time zone 'Asia/Seoul')::date + 5)`,
      [scenario.centerId, member.passId],
    );
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00' });
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessionId })).toBe('PASS_ON_HOLD');
  });

  it('만료된 이용권·소진된 이용권은 거부한다', async () => {
    const scenario = await setupScenario();
    const expired = await addMember(scenario, { startOffset: -40, endOffset: -1 });
    const usedUp = await addMember(scenario, { remaining: 0 });
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    expect(await rpcError(expired.userId, 'book_session', { p_session_id: sessionId })).toBe('PASS_EXPIRED');
    expect(await rpcError(usedUp.userId, 'book_session', { p_session_id: sessionId })).toBe('PASS_EXHAUSTED');
  });

  it('주 3회 제한 이용권은 4번째 예약을 거부한다', async () => {
    const scenario = await setupScenario({
      product: { type: 'period', durationDays: 30, limitCount: 3, limitUnit: 'week' },
    });
    const member = await addMember(scenario);
    // 같은 날(=같은 주) 겹치지 않는 4개 수업
    const sessions = [];
    for (const time of ['06:00', '08:00', '10:00', '12:00']) {
      sessions.push(await createSessionAt(scenario, { dayOffset: 1, localTime: time }));
    }
    for (const sessionId of sessions.slice(0, 3)) {
      const result = await rpc<BookResult>(member.userId, 'book_session', { p_session_id: sessionId });
      expect(result.status).toBe('booked');
    }
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessions[3] })).toBe(
      'PERIOD_LIMIT_REACHED',
    );
  });

  it('프로그램에 허용되지 않은 상품의 이용권뿐이면 NO_VALID_PASS', async () => {
    const scenario = await setupScenario();
    const otherProduct = await createProduct(scenario.centerId, { type: 'period' });
    const member = await addMember(scenario, { productId: otherProduct });
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessionId })).toBe('NO_VALID_PASS');
  });

  it('다른 센터 회원·비로그인 사용자는 예약할 수 없다', async () => {
    const scenario = await setupScenario();
    const other = await setupScenario();
    const outsider = await addMember(other);
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    expect(await rpcError(outsider.userId, 'book_session', { p_session_id: sessionId })).toBe('FORBIDDEN');
    expect(await rpcError(null, 'book_session', { p_session_id: sessionId })).toMatch(/permission denied/);
  });
});
