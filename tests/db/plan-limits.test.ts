import { describe, expect, it } from 'vitest';

import {
  createCenter,
  createMember,
  createPlan,
  createSession,
  createStaff,
  setCenterPlan,
} from './factories';
import { expectDbError, query, queryOne, rpc, rpcError, rpcRows, withUser } from './helpers';
import { addMember, setupScenario } from './scenario';

describe('요금제 인원 한도', () => {
  it('회원 한도를 넘으면 PLAN_MEMBER_LIMIT, 탈퇴 회원은 세지 않는다', async () => {
    const centerId = await createCenter();
    await setCenterPlan(centerId, { planId: await createPlan({ members: 2 }) });
    const first = await createMember(centerId);
    await createMember(centerId);
    expect(await expectDbError(createMember(centerId))).toBe('PLAN_MEMBER_LIMIT');

    await query(`update public.members set status = 'withdrawn', phone = null where id = $1`, [first.id]);
    await createMember(centerId);
    expect(await expectDbError(createMember(centerId))).toBe('PLAN_MEMBER_LIMIT');
  });

  it('직원 한도를 넘으면 PLAN_STAFF_LIMIT, 삭제 취소도 한도를 검사한다', async () => {
    const centerId = await createCenter();
    await createStaff(centerId, 'owner');
    const coach = await createStaff(centerId);
    await setCenterPlan(centerId, { planId: await createPlan({ staff: 2 }) });
    expect(await expectDbError(createStaff(centerId))).toBe('PLAN_STAFF_LIMIT');

    await query(`update public.staff set deleted_at = now() where id = $1`, [coach.id]);
    await createStaff(centerId);
    expect(
      await expectDbError(query(`update public.staff set deleted_at = null where id = $1`, [coach.id])),
    ).toBe('PLAN_STAFF_LIMIT');
  });

  it('한도 없는 요금제는 제한하지 않는다', async () => {
    const centerId = await createCenter();
    await setCenterPlan(centerId, { planId: await createPlan({ members: null }) });
    for (let i = 0; i < 3; i += 1) await createMember(centerId);
    const row = await queryOne<{ count: number }>(
      `select count(*)::int as count from public.members where center_id = $1`,
      [centerId],
    );
    expect(row.count).toBe(3);
  });

  it('직원 권한으로 등록할 때도 한도가 적용되고, 직원은 사용량을 볼 수 있다', async () => {
    const centerId = await createCenter();
    const staff = await createStaff(centerId);
    await setCenterPlan(centerId, { planId: await createPlan({ members: 1 }) });
    await createMember(centerId);
    const error = await expectDbError(
      withUser(staff.userId, (client) =>
        client.query(
          `insert into public.members (center_id, name, phone, privacy_agreed_at)
           values ($1, '새회원', '01099990000', now())`,
          [centerId],
        ),
      ),
    );
    expect(error).toBe('PLAN_MEMBER_LIMIT');
    const usage = await rpc(staff.userId, 'center_plan_usage', { p_center_id: centerId });
    expect(usage).toMatchObject({ max_members: 1, member_count: 1, staff_count: 1, status: 'active' });
  });
});

describe('센터 정지', () => {
  it('정지되면 직원·회원 모두 데이터와 RPC 에 접근할 수 없고, 재개하면 돌아온다', async () => {
    const centerId = await createCenter();
    const owner = await createStaff(centerId, 'owner');
    const member = await createMember(centerId);
    const countMembers = () =>
      withUser(
        owner.userId,
        async (client) => (await client.query('select id from public.members')).rowCount,
      );

    expect(await countMembers()).toBe(1);
    await setCenterPlan(centerId, { status: 'suspended' });
    expect(await countMembers()).toBe(0);
    expect(await rpcError(owner.userId, 'today_summary', { p_center_id: centerId })).toBe('FORBIDDEN');
    expect(await rpcRows(member.userId!, 'my_memberships')).toEqual([]);

    const blocked = await rpcRows(owner.userId, 'my_blocked_centers');
    expect(blocked).toEqual([
      expect.objectContaining({ center_id: centerId, status: 'suspended', via: 'staff' }),
    ]);

    await setCenterPlan(centerId, { status: 'active' });
    expect(await countMembers()).toBe(1);
    expect(await rpcRows(owner.userId, 'my_blocked_centers')).toEqual([]);
  });

  it('정지된 센터에서는 회원이 예약할 수 없다', async () => {
    const scenario = await setupScenario();
    const sessionId = await createSession(scenario.centerId, scenario.programId);
    const member = await addMember(scenario);
    await setCenterPlan(scenario.centerId, { status: 'suspended' });
    expect(await rpcError(member.userId, 'book_session', { p_session_id: sessionId })).toBe('FORBIDDEN');
    await setCenterPlan(scenario.centerId, { status: 'active' });
    expect(await rpc(member.userId, 'book_session', { p_session_id: sessionId })).toMatchObject({
      status: 'booked',
    });
  });

  it('정지된 센터의 알림은 보내지 않고 건너뛴다', async () => {
    const centerId = await createCenter();
    const member = await createMember(centerId);
    await setCenterPlan(centerId, { status: 'suspended' });
    await query(`select private.enqueue_notification($1, $2, 'booking_confirmed', '{}'::jsonb, $3)`, [
      centerId,
      member.id,
      `test:${member.id}`,
    ]);
    const row = await queryOne(`select status, error from public.notification_logs where dedupe_key = $1`, [
      `test:${member.id}`,
    ]);
    expect(row).toEqual({ status: 'skipped', error: 'CENTER_SUSPENDED' });
  });
});
