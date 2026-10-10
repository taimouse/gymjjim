import { describe, expect, it } from 'vitest';

import { createPass } from './factories';
import { query, queryOne, rpc, rpcError, rpcRows } from './helpers';
import { addMember, createSessionAt, type Scenario, setupScenario, type TestMember } from './scenario';

/** 센터 시간대 기준 오늘 + offset 일의 날짜 키 */
const dateKey = async (offset = 0) =>
  (
    await queryOne<{ d: string }>(`select ((now() at time zone 'Asia/Seoul')::date + $1::int)::text as d`, [
      offset,
    ])
  ).d;

/** 테스트용 예약 행을 직접 넣는다 (지난 수업의 출석·노쇼 기록 등) */
async function insertBooking(
  scenario: Scenario,
  sessionId: string,
  member: TestMember,
  status: 'booked' | 'attended' | 'no_show' | 'cancelled',
) {
  await query(
    `insert into public.bookings (center_id, session_id, member_id, member_pass_id, status, pass_deducted,
       attended_at, cancelled_at)
     values ($1, $2, $3, $4, $5, $6, case when $7 then now() end, case when $8 then now() end)`,
    [
      scenario.centerId,
      sessionId,
      member.id,
      member.passId,
      status,
      status !== 'cancelled',
      status === 'attended',
      status === 'cancelled',
    ],
  );
}

/** 센터 시간대 기준 dayOffset 일 뒤 정오 */
const noonSql = `(((now() at time zone 'Asia/Seoul')::date + $2::int) + time '12:00') at time zone 'Asia/Seoul'`;

describe('오늘 화면 RPC', () => {
  it('today_summary: 예약 수 · 출석률 기준 · 신규 회원 · 재등록', async () => {
    const scenario = await setupScenario();
    const [a, b, c, d] = [
      await addMember(scenario),
      await addMember(scenario),
      await addMember(scenario),
      await addMember(scenario),
    ];
    const sessionId = await createSessionAt(scenario, { dayOffset: -1, localTime: '10:00' });
    await insertBooking(scenario, sessionId, a!, 'attended');
    await insertBooking(scenario, sessionId, b!, 'no_show');
    await insertBooking(scenario, sessionId, c!, 'booked');
    await insertBooking(scenario, sessionId, d!, 'cancelled');

    // 네 명 모두 어제 가입. a 는 그저께 첫 이용권, 어제 두 번째 이용권(재등록)
    await query(`update public.members set joined_at = ${noonSql} where center_id = $1`, [
      scenario.centerId,
      -1,
    ]);
    await query(`update public.member_passes set created_at = ${noonSql} where id = $1`, [a!.passId, -2]);
    const second = await createPass(scenario.centerId, a!.id, scenario.productId, { endOffset: 60 });
    await query(`update public.member_passes set created_at = ${noonSql} where id = $1`, [second, -1]);

    const yesterday = await dateKey(-1);
    const summary = await rpc(scenario.owner.userId, 'today_summary', {
      p_center_id: scenario.centerId,
      p_date: yesterday,
    });
    expect(summary).toEqual({
      date: yesterday,
      bookings: 3,
      attended: 1,
      attendance_base: 3,
      new_members: 4,
      renewals: 1,
    });

    // 직원(코치)도 볼 수 있고, 회원·다른 센터 직원은 볼 수 없다
    await expect(
      rpc(scenario.staff.userId, 'today_summary', { p_center_id: scenario.centerId }),
    ).resolves.toMatchObject({
      date: await dateKey(0),
    });
    expect(await rpcError(a!.userId, 'today_summary', { p_center_id: scenario.centerId })).toBe('FORBIDDEN');
    const other = await setupScenario();
    expect(await rpcError(other.owner.userId, 'today_summary', { p_center_id: scenario.centerId })).toBe(
      'FORBIDDEN',
    );
  });

  it('today_followups: 만료 임박 · 잔여 1~2회 · 2주 미출석 (재등록한 회원은 제외)', async () => {
    const scenario = await setupScenario();
    const expiring = await addMember(scenario, { endOffset: 3 });
    const low = await addMember(scenario, { remaining: 2 });
    const inactive = await addMember(scenario, { startOffset: -20 });
    const renewed = await addMember(scenario, { endOffset: 2 });
    await createPass(scenario.centerId, renewed.id, scenario.productId, { endOffset: 60 });
    const active = await addMember(scenario, { startOffset: -20 });
    const recentAttendance = await createSessionAt(scenario, { dayOffset: -3, localTime: '10:00' });
    await insertBooking(scenario, recentAttendance, active, 'attended');
    const newcomer = await addMember(scenario, { startOffset: -5 });

    const rows = await rpcRows<{
      reason: string;
      member_id: string;
      days_left: number | null;
      remaining: number | null;
      last_attended_at: string | null;
    }>(scenario.staff.userId, 'today_followups', { p_center_id: scenario.centerId });
    const ids = (reason: string) => rows.filter((row) => row.reason === reason).map((row) => row.member_id);

    expect(ids('expiring')).toEqual([expiring.id]);
    expect(rows.find((row) => row.reason === 'expiring')).toMatchObject({ days_left: 3 });
    expect(ids('low')).toEqual([low.id]);
    expect(rows.find((row) => row.reason === 'low')).toMatchObject({ remaining: 2 });
    expect(ids('inactive')).toEqual([inactive.id]);
    expect(rows.find((row) => row.reason === 'inactive')).toMatchObject({ last_attended_at: null });
    for (const excluded of [renewed.id, active.id, newcomer.id]) {
      expect(rows.some((row) => row.member_id === excluded)).toBe(false);
    }

    expect(await rpcError(expiring.userId, 'today_followups', { p_center_id: scenario.centerId })).toBe(
      'FORBIDDEN',
    );
  });

  it('center_stats: 일별·월별 예약 · 출석 · 신규 · 재등록', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const yesterdaySession = await createSessionAt(scenario, { dayOffset: -1, localTime: '10:00' });
    await insertBooking(scenario, yesterdaySession, member, 'attended');
    const twoDaysAgo = await createSessionAt(scenario, { dayOffset: -2, localTime: '10:00' });
    await insertBooking(scenario, twoDaysAgo, member, 'no_show');

    const days = await rpcRows<{ bucket: string; bookings: number; attended: number; new_members: number }>(
      scenario.owner.userId,
      'center_stats',
      { p_center_id: scenario.centerId, p_unit: 'day', p_count: 7 },
    );
    const [today, yesterday, twoDaysAgoKey] = [await dateKey(0), await dateKey(-1), await dateKey(-2)];
    expect(days).toHaveLength(7);
    expect(days.at(-1)).toMatchObject({ bucket: today, new_members: 1 });
    expect(days.find((row) => row.bucket === yesterday)).toMatchObject({ bookings: 1, attended: 1 });
    expect(days.find((row) => row.bucket === twoDaysAgoKey)).toMatchObject({ bookings: 1, attended: 0 });

    const months = await rpcRows<{ bucket: string; bookings: number; attended: number }>(
      scenario.owner.userId,
      'center_stats',
      { p_center_id: scenario.centerId, p_unit: 'month', p_count: 3 },
    );
    expect(months).toHaveLength(3);
    const monthStart = `${today.slice(0, 8)}01`;
    expect(months.at(-1)!.bucket).toBe(monthStart);
    expect(months.reduce((sum, row) => sum + row.bookings, 0)).toBe(2);

    expect(
      await rpcError(scenario.owner.userId, 'center_stats', {
        p_center_id: scenario.centerId,
        p_unit: 'year',
        p_count: 3,
      }),
    ).toBe('VALIDATION');
  });
});
