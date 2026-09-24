import { describe, expect, it } from 'vitest';

import { createMember, createSession } from './factories';
import { query, queryOne, rpc, rpcError, rpcRows } from './helpers';
import { addMember, type BookResult, createSessionAt, setupScenario } from './scenario';

/** 센터 시간대 기준 오늘 + offset 일의 날짜 키 */
const dateKey = async (offset = 0) =>
  (
    await queryOne<{ d: string }>(`select ((now() at time zone 'Asia/Seoul')::date + $1::int)::text as d`, [
      offset,
    ])
  ).d;

describe('회원 앱 RPC', () => {
  it('member_schedule: 날짜 범위의 수업과 내 예약 상태', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSessionAt(scenario, { dayOffset: 1, localTime: '10:00' });
    const otherSessionId = await createSessionAt(scenario, { dayOffset: 1, localTime: '12:00' });
    await rpc(member.userId, 'book_session', { p_session_id: sessionId });
    const d = await dateKey(1);
    const rows = await rpcRows<{
      session_id: string;
      my_status: string | null;
      my_pass_type: string | null;
      booked_count: number;
    }>(member.userId, 'member_schedule', { p_center_id: scenario.centerId, p_from: d, p_to: d });
    const { type } = await queryOne<{ type: string }>(
      `select type::text from public.member_passes where id = $1`,
      [member.passId],
    );
    expect(rows.find((row) => row.session_id === sessionId)).toMatchObject({
      my_status: 'booked',
      my_pass_type: type,
      booked_count: 1,
    });
    expect(rows.find((row) => row.session_id === otherSessionId)).toMatchObject({
      my_status: null,
      my_pass_type: null,
      booked_count: 0,
    });

    const other = await setupScenario();
    const error = await rpcError(member.userId, 'member_schedule', {
      p_center_id: other.centerId,
      p_from: d,
      p_to: d,
    });
    expect(error).toBe('FORBIDDEN');
  });

  it('preview_booking: 쓰일 이용권과 무료 취소 기한, 없으면 에러 코드', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario, { endOffset: 20 });
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    const preview = await rpc<{
      pass: { id: string; remaining_count: number };
      error: null;
      free_cancel_until: string;
    }>(member.userId, 'preview_booking', { p_session_id: sessionId });
    expect(preview.pass).toMatchObject({ id: member.passId, remaining_count: 10 });
    expect(preview.error).toBeNull();
    expect(Date.parse(preview.free_cancel_until)).toBeGreaterThan(Date.now());

    const noPass = await createMember(scenario.centerId);
    const empty = await rpc<{ pass: null; error: string }>(noPass.userId!, 'preview_booking', {
      p_session_id: sessionId,
    });
    expect(empty).toMatchObject({ pass: null, error: 'NO_VALID_PASS' });
  });

  it('member_bookings: 다가오는 예약과 지난 기록을 나눈다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const future = await createSession(scenario.centerId, scenario.programId);
    const booked = await rpc<BookResult>(member.userId, 'book_session', { p_session_id: future });
    const past = await createSession(scenario.centerId, scenario.programId, { startsInMinutes: -24 * 60 });
    await query(
      `insert into public.bookings (center_id, session_id, member_id, member_pass_id, status) values ($1, $2, $3, $4, 'attended')`,
      [scenario.centerId, past, member.id, member.passId],
    );
    const upcoming = await rpcRows<{ booking_id: string }>(member.userId, 'member_bookings', {
      p_center_id: scenario.centerId,
      p_upcoming: true,
    });
    expect(upcoming.map((row) => row.booking_id)).toEqual([booked.booking_id]);
    const history = await rpcRows<{ status: string }>(member.userId, 'member_bookings', {
      p_center_id: scenario.centerId,
      p_upcoming: false,
    });
    expect(history.map((row) => row.status)).toEqual(['attended']);
  });

  it('update_my_settings: 알림·마케팅 수신 설정', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    await rpc(member.userId, 'update_my_settings', {
      p_center_id: scenario.centerId,
      p_notify_enabled: false,
      p_marketing_agreed: true,
    });
    const row = await queryOne<{ notify_enabled: boolean; marketing: boolean }>(
      `select notify_enabled, marketing_agreed_at is not null as marketing from public.members where id = $1`,
      [member.id],
    );
    expect(row).toEqual({ notify_enabled: false, marketing: true });
  });

  it('repeat_last_week_candidates: 일주일 전 수업과 같은 이번 수업', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario, { startOffset: -10 });
    const lastWeek = await createSession(scenario.centerId, scenario.programId, {
      startsInMinutes: -7 * 24 * 60 + 180,
    });
    await query(
      `insert into public.bookings (center_id, session_id, member_id, member_pass_id, status) values ($1, $2, $3, $4, 'attended')`,
      [scenario.centerId, lastWeek, member.id, member.passId],
    );
    const thisWeek = await createSession(scenario.centerId, scenario.programId, { startsInMinutes: 180 });
    await query(
      `update public.sessions set starts_at = (select starts_at + interval '7 days' from public.sessions where id = $2),
         ends_at = (select ends_at + interval '7 days' from public.sessions where id = $2) where id = $1`,
      [thisWeek, lastWeek],
    );
    const candidates = await rpcRows<{ session_id: string; bookable: boolean }>(
      member.userId,
      'repeat_last_week_candidates',
      { p_center_id: scenario.centerId },
    );
    expect(candidates).toEqual([expect.objectContaining({ session_id: thisWeek, bookable: true })]);
  });
});
