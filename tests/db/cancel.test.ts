import { describe, expect, it } from 'vitest';

import { createSession } from './factories';
import { query, rpc, rpcError } from './helpers';
import {
  addMember,
  bookingStatus,
  type BookResult,
  notifications,
  remaining,
  sessionCounts,
  setupScenario,
} from './scenario';

interface CancelResult {
  booking_id: string;
  status: 'cancelled' | 'late_cancelled';
  restored: boolean;
  promoted: string[];
}

describe('cancel_booking', () => {
  it('무료 취소 → 횟수 복구 + 대기 1순위 자동 승격', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { capacity: 1 });
    const booker = await addMember(scenario);
    const first = await addMember(scenario);
    const second = await addMember(scenario);

    const booked = await rpc<BookResult>(booker.userId, 'book_session', { p_session_id: sessionId });
    const wait1 = await rpc<BookResult>(first.userId, 'book_session', { p_session_id: sessionId });
    const wait2 = await rpc<BookResult>(second.userId, 'book_session', { p_session_id: sessionId });
    expect([wait1.waitlist_position, wait2.waitlist_position]).toEqual([1, 2]);
    expect(await remaining(booker.passId)).toBe(9);

    const result = await rpc<CancelResult>(booker.userId, 'cancel_booking', {
      p_booking_id: booked.booking_id,
    });
    expect(result).toMatchObject({ status: 'cancelled', restored: true, promoted: [wait1.booking_id] });
    expect(await remaining(booker.passId)).toBe(10);

    expect(await bookingStatus(wait1.booking_id)).toEqual({ status: 'booked', waitlist_position: null });
    expect(await bookingStatus(wait2.booking_id)).toEqual({ status: 'waitlisted', waitlist_position: 1 });
    expect(await remaining(first.passId)).toBe(9);
    expect(await sessionCounts(sessionId)).toEqual({ booked_count: 1, waitlist_count: 1 });
    expect(await notifications(first.id, 'waitlist_promoted')).toHaveLength(1);
  });

  it('늦은 취소(시작 3시간 이내) → late_cancelled, 차감 유지', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { startsInMinutes: 120 });
    const member = await addMember(scenario);
    const booked = await rpc<BookResult>(member.userId, 'book_session', { p_session_id: sessionId });
    expect(await remaining(member.passId)).toBe(9);

    const result = await rpc<CancelResult>(member.userId, 'cancel_booking', {
      p_booking_id: booked.booking_id,
    });
    expect(result).toMatchObject({ status: 'late_cancelled', restored: false });
    expect(await remaining(member.passId)).toBe(9);
    expect(await sessionCounts(sessionId)).toEqual({ booked_count: 0, waitlist_count: 0 });
  });

  it('직원은 늦은 취소도 차감 없이 처리해 줄 수 있다 (회원은 불가)', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { startsInMinutes: 120 });
    const member = await addMember(scenario);
    const booked = await rpc<BookResult>(member.userId, 'book_session', { p_session_id: sessionId });

    expect(
      await rpcError(member.userId, 'cancel_booking', {
        p_booking_id: booked.booking_id,
        p_waive_penalty: true,
      }),
    ).toBe('FORBIDDEN');
    const result = await rpc<CancelResult>(scenario.staff.userId, 'cancel_booking', {
      p_booking_id: booked.booking_id,
      p_waive_penalty: true,
    });
    expect(result).toMatchObject({ status: 'cancelled', restored: true });
    expect(await remaining(member.passId)).toBe(10);
  });

  it('대기 취소는 뒤 순번을 한 칸씩 당긴다', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { capacity: 1 });
    const [a, b, c, d] = await Promise.all(Array.from({ length: 4 }, () => addMember(scenario)));
    await rpc(a!.userId, 'book_session', { p_session_id: sessionId });
    const wb = await rpc<BookResult>(b!.userId, 'book_session', { p_session_id: sessionId });
    const wc = await rpc<BookResult>(c!.userId, 'book_session', { p_session_id: sessionId });
    const wd = await rpc<BookResult>(d!.userId, 'book_session', { p_session_id: sessionId });

    await rpc(b!.userId, 'cancel_booking', { p_booking_id: wb.booking_id });
    expect(await bookingStatus(wc.booking_id)).toEqual({ status: 'waitlisted', waitlist_position: 1 });
    expect(await bookingStatus(wd.booking_id)).toEqual({ status: 'waitlisted', waitlist_position: 2 });
    expect(await sessionCounts(sessionId)).toEqual({ booked_count: 1, waitlist_count: 2 });
  });

  it('승격 차례에 이용권을 쓸 수 없게 된 대기자는 건너뛴다', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { capacity: 1 });
    const booker = await addMember(scenario);
    const broke = await addMember(scenario);
    const next = await addMember(scenario);
    const booked = await rpc<BookResult>(booker.userId, 'book_session', { p_session_id: sessionId });
    const w1 = await rpc<BookResult>(broke.userId, 'book_session', { p_session_id: sessionId });
    const w2 = await rpc<BookResult>(next.userId, 'book_session', { p_session_id: sessionId });
    await query(`update public.member_passes set status = 'cancelled' where id = $1`, [broke.passId]);

    const result = await rpc<CancelResult>(booker.userId, 'cancel_booking', {
      p_booking_id: booked.booking_id,
    });
    expect(result.promoted).toEqual([w2.booking_id]);
    expect((await bookingStatus(w1.booking_id)).status).toBe('cancelled');
    expect(await sessionCounts(sessionId)).toEqual({ booked_count: 1, waitlist_count: 0 });
  });

  it('예약 마감 이후 취소로 생긴 자리는 자동 승격하지 않는다', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { capacity: 1 });
    const booker = await addMember(scenario);
    const waiter = await addMember(scenario);
    const booked = await rpc<BookResult>(booker.userId, 'book_session', { p_session_id: sessionId });
    const waiting = await rpc<BookResult>(waiter.userId, 'book_session', { p_session_id: sessionId });
    // 수업을 20분 뒤로 당겨 예약 마감(30분 전) 이후로 만든다
    await query(
      `update public.sessions set starts_at = now() + interval '20 minutes', ends_at = now() + interval '80 minutes'
       where id = $1`,
      [sessionId],
    );
    const result = await rpc<CancelResult>(booker.userId, 'cancel_booking', {
      p_booking_id: booked.booking_id,
    });
    expect(result.promoted).toEqual([]);
    expect((await bookingStatus(waiting.booking_id)).status).toBe('waitlisted');
  });

  it('다른 회원의 예약은 취소할 수 없고, 시작한 수업은 회원이 취소할 수 없다', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    const owner = await addMember(scenario);
    const stranger = await addMember(scenario);
    const booked = await rpc<BookResult>(owner.userId, 'book_session', { p_session_id: sessionId });
    expect(await rpcError(stranger.userId, 'cancel_booking', { p_booking_id: booked.booking_id })).toBe(
      'BOOKING_NOT_FOUND',
    );
    await query(
      `update public.sessions set starts_at = now() - interval '5 minutes', ends_at = now() + interval '55 minutes'
       where id = $1`,
      [sessionId],
    );
    expect(await rpcError(owner.userId, 'cancel_booking', { p_booking_id: booked.booking_id })).toBe(
      'SESSION_STARTED',
    );
  });
});
