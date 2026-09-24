import { describe, expect, it } from 'vitest';

import { createMember, createPass } from './factories';
import { query, queryOne, rpc, rpcError } from './helpers';
import { addMember, createSessionAt, type Scenario, setupScenario } from './scenario';

/** 센터 시간대(Asia/Seoul) 기준 dayOffset 일 뒤 time 시각 */
async function localTime(dayOffset: number, time: string): Promise<Date> {
  const row = await queryOne<{ t: Date }>(
    `select (((now() at time zone 'Asia/Seoul')::date + $1::int) + $2::time) at time zone 'Asia/Seoul' as t`,
    [dayOffset, time],
  );
  return row.t;
}

const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

async function enqueue(scenario: Scenario, now: Date): Promise<number> {
  const row = await queryOne<{ n: number }>(`select public.enqueue_scheduled_notifications($1, $2) as n`, [
    now,
    scenario.centerId,
  ]);
  return row.n;
}

async function logs(scenario: Scenario) {
  return query<{ id: string; type: string; status: string; error: string | null; member_id: string }>(
    `select id, type, status::text, error, member_id from public.notification_logs where center_id = $1
     order by created_at, type`,
    [scenario.centerId],
  );
}

type Claimed = {
  id: string;
  type: string;
  phone: string;
  center_name: string;
  attempts: number;
  sms_fallback: boolean;
};

async function claim(scenario: Scenario): Promise<Claimed[]> {
  return query<Claimed>(`select * from public.claim_notifications(50, $1)`, [scenario.centerId]);
}

async function finish(id: string, ok: boolean, error: string | null = null): Promise<string> {
  const row = await queryOne<{ status: string }>(
    `select public.finish_notification($1, $2, $3)::text as status`,
    [id, ok, error],
  );
  return row.status;
}

describe('알림 스케줄러 (리마인드 · 만료 D-7)', () => {
  it('2시간 전 리마인드: 발송 시각이 되면 한 번만 넣는다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSessionAt(scenario, { dayOffset: 1, localTime: '15:00' });
    await rpc(member.userId, 'book_session', { p_session_id: sessionId });

    const sendAt = await localTime(1, '13:00');
    expect(await enqueue(scenario, minutesAfter(sendAt, -1))).toBe(0);
    expect(await enqueue(scenario, minutesAfter(sendAt, 1))).toBe(1);
    expect(await enqueue(scenario, minutesAfter(sendAt, 5))).toBe(0);
    // 1시간이 지나도록 못 보냈으면 늦은 안내가 되므로 넣지 않는다
    expect(await enqueue(scenario, minutesAfter(sendAt, 61))).toBe(0);

    const reminders = (await logs(scenario)).filter((row) => row.type === 'reminder_2h');
    expect(reminders).toEqual([expect.objectContaining({ status: 'pending', member_id: member.id })]);
  });

  it('2시간 전 리마인드: 발송 시각이 21시~08시에 걸리면 보내지 않는다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const cases = [
      { start: '09:30', send: '07:30', expected: 0 },
      { start: '23:30', send: '21:30', expected: 0 },
      { start: '22:30', send: '20:30', expected: 1 },
    ];
    for (const item of cases) {
      const sessionId = await createSessionAt(scenario, {
        dayOffset: 1,
        localTime: item.start,
        durationMin: 50,
      });
      await rpc(member.userId, 'book_session', { p_session_id: sessionId });
      const count = await enqueue(scenario, minutesAfter(await localTime(1, item.send), 1));
      expect({ start: item.start, count }).toEqual({ start: item.start, count: item.expected });
    }
  });

  it('전날 리마인드: 수업 전날 20시, 알림을 끈 회원은 건너뛴 기록만 남긴다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const quiet = await createMember(scenario.centerId, { notifyEnabled: false });
    await createPass(scenario.centerId, quiet.id, scenario.productId);
    const sessionId = await createSessionAt(scenario, { dayOffset: 2, localTime: '07:00' });
    await rpc(member.userId, 'book_session', { p_session_id: sessionId });
    await rpc(quiet.userId, 'book_session', { p_session_id: sessionId });

    expect(await enqueue(scenario, minutesAfter(await localTime(1, '20:00'), 5))).toBe(2);
    const reminders = (await logs(scenario)).filter((row) => row.type === 'reminder_day_before');
    expect(reminders).toHaveLength(2);
    expect(reminders.find((row) => row.member_id === member.id)).toMatchObject({ status: 'pending' });
    expect(reminders.find((row) => row.member_id === quiet.id)).toMatchObject({
      status: 'skipped',
      error: 'NOTIFY_DISABLED',
    });
  });

  it('만료 D-7: 10시~21시에 한 번, 다음 이용권을 이미 받은 회원은 제외', async () => {
    const scenario = await setupScenario();
    const expiring = await addMember(scenario, { endOffset: 7 });
    const renewed = await addMember(scenario, { endOffset: 7 });
    await createPass(scenario.centerId, renewed.id, scenario.productId, { endOffset: 60 });

    expect(await enqueue(scenario, await localTime(0, '09:30'))).toBe(0);
    expect(await enqueue(scenario, await localTime(0, '10:30'))).toBe(1);
    expect(await enqueue(scenario, await localTime(0, '11:30'))).toBe(0);
    const rows = (await logs(scenario)).filter((row) => row.type === 'pass_expiring_d7');
    expect(rows.map((row) => row.member_id)).toEqual([expiring.id]);
  });
});

describe('알림 발송 대기열 (claim · finish)', () => {
  it('상황이 바뀐 알림은 건너뛰고, 실패하면 3번까지 다시 시도한다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const other = await addMember(scenario);
    const sessionId = await createSessionAt(scenario, { dayOffset: 1, localTime: '15:00' });
    await rpc(member.userId, 'book_session', { p_session_id: sessionId });
    const cancelled = await rpc<{ booking_id: string }>(other.userId, 'book_session', {
      p_session_id: sessionId,
    });
    await rpc(other.userId, 'cancel_booking', { p_booking_id: cancelled.booking_id });

    const claimed = await claim(scenario);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ type: 'booking_confirmed', attempts: 1, sms_fallback: false });
    expect(claimed[0]!.phone).toMatch(/^010\d{8}$/);
    expect((await logs(scenario)).find((row) => row.member_id === other.id)).toMatchObject({
      status: 'skipped',
      error: 'BOOKING_CHANGED',
    });
    expect(await claim(scenario)).toHaveLength(0);

    const id = claimed[0]!.id;
    expect(await finish(id, false, 'HTTP_500')).toBe('pending');
    expect(await claim(scenario)).toHaveLength(0); // 5분 뒤로 미뤄졌다
    for (const expected of ['pending', 'failed']) {
      await query(`update public.notification_logs set scheduled_at = now() where id = $1`, [id]);
      const again = await claim(scenario);
      expect(again).toHaveLength(1);
      expect(await finish(id, false, 'HTTP_500')).toBe(expected);
    }
    const failed = await queryOne<{ attempts: number; error: string }>(
      `select attempts, error from public.notification_logs where id = $1`,
      [id],
    );
    expect(failed).toEqual({ attempts: 3, error: 'HTTP_500' });
    await expect(finish(id, true)).rejects.toThrow('INVALID_STATUS');
  });

  it('발송 중에 멈춘 건은 10분 뒤 다시 가져간다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const sessionId = await createSessionAt(scenario, { dayOffset: 1, localTime: '15:00' });
    await rpc(member.userId, 'book_session', { p_session_id: sessionId });
    const [first] = await claim(scenario);
    await query(
      `update public.notification_logs set locked_at = now() - interval '11 minutes' where id = $1`,
      [first!.id],
    );
    const retried = await claim(scenario);
    expect(retried).toEqual([expect.objectContaining({ id: first!.id, attempts: 2 })]);
    expect(await finish(first!.id, true)).toBe('sent');
  });

  it('초대 링크: 보낸 뒤에는 기록에서 링크를 지우고, 새 링크가 나가면 옛 링크는 보내지 않는다', async () => {
    const scenario = await setupScenario();
    const member = await createMember(scenario.centerId, { withUser: false });
    await rpc(scenario.owner.userId, 'create_member_invite', {
      p_member_id: member.id,
      p_invite_url_base: 'https://gymjjim.test/invite/',
    });
    await rpc(scenario.owner.userId, 'create_member_invite', {
      p_member_id: member.id,
      p_invite_url_base: 'https://gymjjim.test/invite/',
    });
    const claimed = await claim(scenario);
    expect(claimed).toHaveLength(1);
    expect(await finish(claimed[0]!.id, true)).toBe('sent');

    const rows = await query<{ status: string; error: string | null; has_url: boolean }>(
      `select status::text, error, payload ? 'invite_url' as has_url from public.notification_logs
       where center_id = $1 order by created_at`,
      [scenario.centerId],
    );
    expect(rows).toEqual([
      { status: 'skipped', error: 'INVITE_CHANGED', has_url: false },
      { status: 'sent', error: null, has_url: false },
    ]);
  });

  it('발송 함수는 service_role 만 부를 수 있다', async () => {
    const scenario = await setupScenario();
    for (const fn of ['claim_notifications', 'enqueue_scheduled_notifications']) {
      expect(await rpcError(scenario.owner.userId, fn)).toMatch(/permission denied/);
    }
  });
});
