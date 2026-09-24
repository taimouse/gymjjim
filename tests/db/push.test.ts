import { describe, expect, it } from 'vitest';

import { query, queryOne, rpc, rpcError, withUser } from './helpers';
import { addMember, createSessionAt, setupScenario } from './scenario';

const subscription = (suffix: string) => ({
  p_endpoint: `https://push.example.com/send/${suffix}`,
  p_p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  p_auth: 'tBHItJI5svbpez7KI4CCXg',
});

async function subscriptions(centerId: string) {
  return query<{ member_id: string; endpoint: string }>(
    `select member_id, endpoint from public.push_subscriptions where center_id = $1 order by endpoint`,
    [centerId],
  );
}

describe('웹 푸시 구독', () => {
  it('회원이 기기 구독을 저장·해제하고, 같은 기기를 다른 회원이 쓰면 옮겨진다', async () => {
    const scenario = await setupScenario();
    const first = await addMember(scenario);
    const second = await addMember(scenario);
    const device = subscription(crypto.randomUUID());

    await rpc(first.userId, 'save_push_subscription', { p_center_id: scenario.centerId, ...device });
    expect(await subscriptions(scenario.centerId)).toEqual([
      { member_id: first.id, endpoint: device.p_endpoint },
    ]);

    await rpc(second.userId, 'save_push_subscription', { p_center_id: scenario.centerId, ...device });
    expect(await subscriptions(scenario.centerId)).toEqual([
      { member_id: second.id, endpoint: device.p_endpoint },
    ]);

    // 남의 구독은 지울 수 없다
    await rpc(first.userId, 'delete_push_subscription', { p_endpoint: device.p_endpoint });
    expect(await subscriptions(scenario.centerId)).toHaveLength(1);
    await rpc(second.userId, 'delete_push_subscription', { p_endpoint: device.p_endpoint });
    expect(await subscriptions(scenario.centerId)).toHaveLength(0);
  });

  it('소속이 아닌 센터·잘못된 주소는 저장할 수 없고, 본인 구독만 보인다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const other = await setupScenario();
    expect(
      await rpcError(member.userId, 'save_push_subscription', {
        p_center_id: other.centerId,
        ...subscription(crypto.randomUUID()),
      }),
    ).toBe('FORBIDDEN');
    expect(
      await rpcError(member.userId, 'save_push_subscription', {
        p_center_id: scenario.centerId,
        ...subscription('x'),
        p_endpoint: 'http://insecure.example.com/x',
      }),
    ).toBe('VALIDATION');

    const mine = subscription(crypto.randomUUID());
    await rpc(member.userId, 'save_push_subscription', { p_center_id: scenario.centerId, ...mine });
    const stranger = await addMember(scenario);
    await rpc(stranger.userId, 'save_push_subscription', {
      p_center_id: scenario.centerId,
      ...subscription(crypto.randomUUID()),
    });
    const visible = await withUser(member.userId, async (client) => {
      const { rows } = await client.query<{ endpoint: string }>(
        `select endpoint from public.push_subscriptions`,
      );
      return rows.map((row) => row.endpoint);
    });
    expect(visible).toEqual([mine.p_endpoint]);
    // 직원도 회원의 기기 정보를 볼 필요가 없다
    const staffVisible = await withUser(scenario.owner.userId, async (client) => {
      const { rows } = await client.query(`select 1 from public.push_subscriptions`);
      return rows.length;
    });
    expect(staffVisible).toBe(0);
  });

  it('발송 대기열이 회원의 푸시 구독을 함께 돌려주고, 만료된 구독은 service_role 이 지운다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const device = subscription(crypto.randomUUID());
    await rpc(member.userId, 'save_push_subscription', { p_center_id: scenario.centerId, ...device });
    const sessionId = await createSessionAt(scenario, { dayOffset: 1, localTime: '15:00' });
    await rpc(member.userId, 'book_session', { p_session_id: sessionId });

    const [claimed] = await query<{
      push_subscriptions: { endpoint: string; p256dh: string; auth: string }[];
    }>(`select * from public.claim_notifications(10, $1)`, [scenario.centerId]);
    expect(claimed?.push_subscriptions).toEqual([
      { endpoint: device.p_endpoint, p256dh: device.p_p256dh, auth: device.p_auth },
    ]);

    expect(
      await rpcError(member.userId, 'remove_push_subscriptions', { p_endpoints: [device.p_endpoint] }),
    ).toMatch(/permission denied/);
    const removed = await queryOne<{ n: number }>(`select public.remove_push_subscriptions($1) as n`, [
      [device.p_endpoint],
    ]);
    expect(removed.n).toBe(1);
  });
});
