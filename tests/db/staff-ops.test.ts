import { describe, expect, it } from 'vitest';

import { createSession } from './factories';
import { query, queryOne, rpc, rpcError } from './helpers';
import {
  addMember,
  bookingStatus,
  type BookResult,
  createSessionAt,
  notifications,
  remaining,
  sessionCounts,
  setupScenario,
} from './scenario';

describe('set_attendance', () => {
  it('출석 → 되돌리기 → 노쇼 (좌석·차감은 그대로)', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    const member = await addMember(scenario);
    const booked = await rpc<BookResult>(member.userId, 'book_session', { p_session_id: sessionId });

    const attend = { p_booking_id: booked.booking_id, p_status: 'attended' };
    expect(await rpc(scenario.staff.userId, 'set_attendance', attend)).toMatchObject({
      status: 'attended',
      previous_status: 'booked',
    });
    await rpc(scenario.staff.userId, 'set_attendance', {
      p_booking_id: booked.booking_id,
      p_status: 'booked',
    });
    expect((await bookingStatus(booked.booking_id)).status).toBe('booked');
    await rpc(scenario.staff.userId, 'set_attendance', {
      p_booking_id: booked.booking_id,
      p_status: 'no_show',
    });
    expect((await bookingStatus(booked.booking_id)).status).toBe('no_show');
    expect(await remaining(member.passId)).toBe(9);
    expect(await sessionCounts(sessionId)).toEqual({ booked_count: 1, waitlist_count: 0 });
  });

  it('회원·다른 센터 직원은 출석을 바꿀 수 없다', async () => {
    const scenario = await setupScenario();
    const other = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    const member = await addMember(scenario);
    const booked = await rpc<BookResult>(member.userId, 'book_session', { p_session_id: sessionId });
    const args = { p_booking_id: booked.booking_id, p_status: 'attended' };
    expect(await rpcError(member.userId, 'set_attendance', args)).toBe('FORBIDDEN');
    expect(await rpcError(other.staff.userId, 'set_attendance', args)).toBe('FORBIDDEN');
  });
});

describe('staff_book_for_member', () => {
  it('오픈·마감 규칙을 무시하고 지난 수업에도 대리 예약할 수 있다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const past = await createSessionAt(scenario, { dayOffset: -1, localTime: '10:00' });
    const args = { p_session_id: past, p_member_id: member.id };
    expect(await rpcError(scenario.staff.userId, 'staff_book_for_member', args)).toBe('BOOKING_CLOSED');
    const result = await rpc<BookResult>(scenario.staff.userId, 'staff_book_for_member', {
      ...args,
      p_override_rules: true,
    });
    expect(result.status).toBe('booked');
    const row = await queryOne<{ booked_by: string }>(`select booked_by from public.bookings where id = $1`, [
      result.booking_id,
    ]);
    expect(row.booked_by).toBe('staff');
  });

  it('정원이 차면 SESSION_FULL, 초과 옵션이나 대기 등록을 명시해야 한다', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { capacity: 1 });
    const [a, b, c] = await Promise.all([addMember(scenario), addMember(scenario), addMember(scenario)]);
    await rpc(a.userId, 'book_session', { p_session_id: sessionId });

    const base = { p_session_id: sessionId, p_member_id: b.id };
    expect(await rpcError(scenario.staff.userId, 'staff_book_for_member', base)).toBe('SESSION_FULL');
    const over = await rpc<BookResult>(scenario.staff.userId, 'staff_book_for_member', {
      ...base,
      p_allow_over_capacity: true,
    });
    expect(over.status).toBe('booked');
    const wait = await rpc<BookResult>(scenario.staff.userId, 'staff_book_for_member', {
      p_session_id: sessionId,
      p_member_id: c.id,
      p_waitlist: true,
    });
    expect(wait).toMatchObject({ status: 'waitlisted', waitlist_position: 1 });
    expect(await sessionCounts(sessionId)).toEqual({ booked_count: 2, waitlist_count: 1 });
  });

  it('회원은 대리 예약 RPC 를 쓸 수 없다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    expect(
      await rpcError(member.userId, 'staff_book_for_member', {
        p_session_id: sessionId,
        p_member_id: member.id,
      }),
    ).toBe('FORBIDDEN');
  });
});

describe('cancel_session (폐강)', () => {
  it('모든 예약·대기를 취소하고 차감을 복구하며 알림 대상을 돌려준다', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId, { capacity: 2 });
    const members = await Promise.all(Array.from({ length: 3 }, () => addMember(scenario)));
    for (const m of members) await rpc(m.userId, 'book_session', { p_session_id: sessionId });
    await query(`update public.members set notify_enabled = false where id = $1`, [members[0]!.id]);

    const result = await rpc<{
      affected: { member_id: string; previous_status: string }[];
      restored_count: number;
    }>(scenario.staff.userId, 'cancel_session', { p_session_id: sessionId, p_reason: '강사 사정' });
    expect(result.affected).toHaveLength(3);
    expect(result.restored_count).toBe(2);
    expect(result.affected.map((a) => a.previous_status).sort()).toEqual(['booked', 'booked', 'waitlisted']);

    for (const m of members) expect(await remaining(m.passId)).toBe(10);
    const [session] = await query<{ status: string; booked_count: number; waitlist_count: number }>(
      `select status, booked_count, waitlist_count from public.sessions where id = $1`,
      [sessionId],
    );
    expect(session).toEqual({ status: 'cancelled', booked_count: 0, waitlist_count: 0 });
    // 폐강 알림은 알림 끄기와 관계없이 발송
    expect(await notifications(members[0]!.id, 'session_cancelled')).toEqual([
      { type: 'session_cancelled', status: 'pending' },
    ]);
    expect(await rpcError(scenario.staff.userId, 'cancel_session', { p_session_id: sessionId })).toBe(
      'SESSION_CANCELLED',
    );
  });
});

describe('create_hold (정지)', () => {
  interface HoldResult {
    days: number;
    previous_end_date: string;
    new_end_date: string;
  }

  it('정지 일수만큼 만료일을 연장한다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario, { endOffset: 30 });
    const [dates] = await query<{ start: string; end: string }>(
      `select ((now() at time zone 'Asia/Seoul')::date + 3)::text as start,
              ((now() at time zone 'Asia/Seoul')::date + 9)::text as end`,
    );
    const result = await rpc<HoldResult>(scenario.staff.userId, 'create_hold', {
      p_member_pass_id: member.passId,
      p_start_date: dates!.start,
      p_end_date: dates!.end,
      p_reason: '부상',
    });
    expect(result.days).toBe(7);
    const diff = (Date.parse(result.new_end_date) - Date.parse(result.previous_end_date)) / 86_400_000;
    expect(diff).toBe(7);
    expect(
      await rpcError(scenario.staff.userId, 'create_hold', {
        p_member_pass_id: member.passId,
        p_start_date: dates!.end,
        p_end_date: dates!.end,
      }),
    ).toBe('HOLD_OVERLAP');
  });

  it('정지 기간 안에 예약이 있으면 거부한다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '10:00' });
    await rpc(member.userId, 'book_session', { p_session_id: sessionId });
    const [dates] = await query<{ start: string; end: string }>(
      `select ((now() at time zone 'Asia/Seoul')::date + 1)::text as start,
              ((now() at time zone 'Asia/Seoul')::date + 3)::text as end`,
    );
    expect(
      await rpcError(scenario.staff.userId, 'create_hold', {
        p_member_pass_id: member.passId,
        p_start_date: dates!.start,
        p_end_date: dates!.end,
      }),
    ).toBe('HOLD_HAS_BOOKINGS');
  });

  it('회원은 정지를 등록할 수 없다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    expect(
      await rpcError(member.userId, 'create_hold', {
        p_member_pass_id: member.passId,
        p_start_date: '2030-01-01',
        p_end_date: '2030-01-02',
      }),
    ).toBe('FORBIDDEN');
  });
});
