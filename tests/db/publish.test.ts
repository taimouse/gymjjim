import { describe, expect, it } from 'vitest';

import { query, queryOne, rpc, rpcError, rpcRows, withUser } from './helpers';
import { addMember, createSessionAt, setupScenario } from './scenario';

/** 센터 시간대 기준 오늘 + offset 일의 날짜 키 */
const dateKey = async (offset = 0) =>
  (
    await queryOne<{ d: string }>(`select ((now() at time zone 'Asia/Seoul')::date + $1::int)::text as d`, [
      offset,
    ])
  ).d;

const setSessionPublish = (sessionId: string, interval: string | null) =>
  query(`update public.sessions set publish_at = now() + $2::interval where id = $1`, [sessionId, interval]);

async function scheduleIds(userId: string, centerId: string, offset: number): Promise<string[]> {
  const d = await dateKey(offset);
  const rows = await rpcRows<{ session_id: string }>(userId, 'member_schedule', {
    p_center_id: centerId,
    p_from: d,
    p_to: d,
  });
  return rows.map((row) => row.session_id);
}

describe('공개 예약', () => {
  it('공개 전 수업은 회원 시간표·조회에서 빠지고 예약할 수 없다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const hidden = await createSessionAt(scenario, { dayOffset: 1, localTime: '10:00' });
    const shown = await createSessionAt(scenario, { dayOffset: 1, localTime: '12:00' });
    await setSessionPublish(hidden, '1 day');

    expect(await scheduleIds(member.userId, scenario.centerId, 1)).toEqual([shown]);
    expect(await rpcError(member.userId, 'book_session', { p_session_id: hidden })).toBe('BOOKING_NOT_OPEN');
    expect(await rpcError(member.userId, 'preview_booking', { p_session_id: hidden })).toBe(
      'SESSION_NOT_FOUND',
    );

    // RLS: 회원은 테이블을 직접 읽어도 보이지 않는다. 직원은 보인다
    const visible = (userId: string) =>
      withUser(userId, async (client) => {
        const { rows } = await client.query(`select id from public.sessions where id = $1`, [hidden]);
        return rows.length;
      });
    expect(await visible(member.userId)).toBe(0);
    expect(await visible(scenario.staff.userId)).toBe(1);

    // 관리자 대리 예약은 공개 전에도 된다
    const booked = await rpc<{ status: string }>(scenario.staff.userId, 'staff_book_for_member', {
      p_session_id: hidden,
      p_member_id: member.id,
    });
    expect(booked.status).toBe('booked');
  });

  it('공개 시각이 지나면 보이고 예약할 수 있다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSessionAt(scenario, { dayOffset: 1, localTime: '10:00' });
    await setSessionPublish(sessionId, '-1 minute');

    expect(await scheduleIds(member.userId, scenario.centerId, 1)).toEqual([sessionId]);
    const booked = await rpc<{ status: string }>(member.userId, 'book_session', { p_session_id: sessionId });
    expect(booked.status).toBe('booked');
  });

  it('프로그램이 공개 전이면 그 프로그램의 수업과 프로그램 자체가 회원에게 안 보인다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSessionAt(scenario, { dayOffset: 1, localTime: '10:00' });
    await query(`update public.programs set publish_at = now() + interval '3 days' where id = $1`, [
      scenario.programId,
    ]);

    expect(await scheduleIds(member.userId, scenario.centerId, 1)).toEqual([]);
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessionId })).toBe(
      'BOOKING_NOT_OPEN',
    );
    const programs = await withUser(member.userId, async (client) => {
      const { rows } = await client.query(`select id from public.programs where id = $1`, [
        scenario.programId,
      ]);
      return rows.length;
    });
    expect(programs).toBe(0);
  });

  it('save_program 으로 공개 시각을 저장하고, 비우면 바로 공개', async () => {
    const scenario = await setupScenario();
    const args = {
      p_center_id: scenario.centerId,
      p_name: '번지피지오',
      p_type: 'group',
      p_default_capacity: 8,
      p_duration_min: 50,
      p_color: '#FBCFE8',
      p_allowed_product_ids: [scenario.productId],
    };
    const publishAt = '2030-01-01T00:00:00Z';
    const id = await rpc<string>(scenario.owner.userId, 'save_program', { ...args, p_publish_at: publishAt });
    const saved = await queryOne<{ publish_at: Date | null }>(
      `select publish_at from public.programs where id = $1`,
      [id],
    );
    expect(saved.publish_at?.toISOString()).toBe('2030-01-01T00:00:00.000Z');

    await rpc(scenario.owner.userId, 'save_program', { ...args, p_id: id });
    const cleared = await queryOne<{ publish_at: Date | null }>(
      `select publish_at from public.programs where id = $1`,
      [id],
    );
    expect(cleared.publish_at).toBeNull();
  });

  it('set_session_publish_at: 이후 반복 전체를 지금 공개, 회원은 못 바꾼다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const group = await queryOne<{ id: string }>(`select gen_random_uuid() as id`);
    const ids = [];
    for (const dayOffset of [1, 2, 3]) {
      const id = await createSessionAt(scenario, { dayOffset, localTime: '10:00' });
      await query(
        `update public.sessions set recurrence_group_id = $2, publish_at = now() + interval '7 days' where id = $1`,
        [id, group.id],
      );
      ids.push(id);
    }

    const updated = await rpc<number>(scenario.staff.userId, 'set_session_publish_at', {
      p_session_id: ids[1],
      p_scope: 'following',
      p_publish_at: null,
    });
    expect(updated).toBe(2);
    const rows = await query<{ id: string; published: boolean }>(
      `select id, publish_at is null as published from public.sessions where id = any($1::uuid[])`,
      [ids],
    );
    expect(Object.fromEntries(rows.map((row) => [row.id, row.published]))).toEqual({
      [ids[0]!]: false,
      [ids[1]!]: true,
      [ids[2]!]: true,
    });

    expect(
      await rpcError(member.userId, 'set_session_publish_at', { p_session_id: ids[0], p_scope: 'this' }),
    ).toBe('FORBIDDEN');
  });
});
