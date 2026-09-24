import { beforeAll, describe, expect, it } from 'vitest';

import { createMember } from './factories';
import { query, rpc, rpcError, withUser } from './helpers';
import {
  addMember,
  type BookResult,
  createSessionAt,
  type Scenario,
  setupScenario,
  type TestMember,
} from './scenario';

// 센터 A 의 대표·직원·회원이 센터 B(와 다른 회원)의 데이터를 읽거나 바꿀 수 없는지 한 번에 확인한다.
let a: Scenario;
let b: Scenario;
let memberA: TestMember;
let otherMemberA: TestMember;
let memberB: TestMember;
let sessionB: string;
let bookingB: string;
let otherBookingA: string;

const CENTER_TABLES = [
  'staff',
  'members',
  'member_passes',
  'pass_holds',
  'pass_products',
  'programs',
  'program_allowed_products',
  'sessions',
  'bookings',
  'member_invites',
  'notification_logs',
  'push_subscriptions',
];

beforeAll(async () => {
  a = await setupScenario();
  b = await setupScenario();
  memberA = await addMember(a);
  otherMemberA = await addMember(a);
  memberB = await addMember(b);

  sessionB = await createSessionAt(b, { dayOffset: 1, localTime: '10:00' });
  bookingB = (await rpc<BookResult>(memberB.userId, 'book_session', { p_session_id: sessionB })).booking_id;
  const sessionA = await createSessionAt(a, { dayOffset: 1, localTime: '10:00' });
  otherBookingA = (await rpc<BookResult>(otherMemberA.userId, 'book_session', { p_session_id: sessionA }))
    .booking_id;

  // B 쪽에 정지·초대·푸시 구독도 하나씩 만들어 둔다
  await query(
    `insert into public.pass_holds (center_id, member_pass_id, start_date, end_date)
     values ($1, $2, current_date + 20, current_date + 22)`,
    [b.centerId, memberB.passId],
  );
  const invitee = await createMember(b.centerId, { withUser: false });
  await rpc(b.owner.userId, 'create_member_invite', { p_member_id: invitee.id });
  await rpc(memberB.userId, 'save_push_subscription', {
    p_center_id: b.centerId,
    p_endpoint: `https://push.example.com/${crypto.randomUUID()}`,
    p_p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    p_auth: 'tBHItJI5svbpez7KI4CCXg',
  });
});

async function visibleRows(userId: string, table: string, centerId: string): Promise<number> {
  return withUser(userId, async (client) => {
    const column = table === 'centers' ? 'id' : 'center_id';
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from public.${table} where ${column} = $1`,
      [centerId],
    );
    return rows[0]!.n;
  });
}

describe('다른 센터 데이터 읽기', () => {
  it('대표·직원·회원 누구도 다른 센터의 업무 테이블 행을 볼 수 없다', async () => {
    for (const user of [a.owner.userId, a.staff.userId, memberA.userId]) {
      expect(await visibleRows(user, 'centers', b.centerId)).toBe(0);
      for (const table of CENTER_TABLES) {
        expect({ table, rows: await visibleRows(user, table, b.centerId) }).toEqual({ table, rows: 0 });
      }
    }
    // 같은 데이터를 B 의 대표는 본다 (테스트가 빈 테이블을 보고 통과하지 않도록)
    for (const table of [
      'members',
      'member_passes',
      'pass_holds',
      'sessions',
      'bookings',
      'member_invites',
    ]) {
      expect({ table, rows: await visibleRows(b.owner.userId, table, b.centerId) }).not.toEqual({
        table,
        rows: 0,
      });
    }
  });

  it('회원은 같은 센터의 다른 회원 예약·이용권·알림을 볼 수 없다', async () => {
    const seen = await withUser(memberA.userId, async (client) => {
      const bookings = await client.query(`select 1 from public.bookings where id = $1`, [otherBookingA]);
      const passes = await client.query(`select 1 from public.member_passes where id = $1`, [
        otherMemberA.passId,
      ]);
      const logs = await client.query(`select 1 from public.notification_logs`);
      return { bookings: bookings.rowCount, passes: passes.rowCount, logs: logs.rowCount };
    });
    expect(seen).toEqual({ bookings: 0, passes: 0, logs: 0 });
  });
});

describe('다른 센터 데이터 바꾸기 (RPC)', () => {
  it('직원은 다른 센터의 수업·예약·회원·이용권을 바꿀 수 없다', async () => {
    const attempts: [string, Record<string, unknown>][] = [
      ['staff_book_for_member', { p_session_id: sessionB, p_member_id: memberB.id, p_override_rules: true }],
      ['set_attendance', { p_booking_id: bookingB, p_status: 'attended' }],
      ['cancel_booking', { p_booking_id: bookingB }],
      ['cancel_session', { p_session_id: sessionB }],
      ['update_session', { p_session_id: sessionB, p_capacity: 99 }],
      [
        'grant_member_pass',
        { p_member_id: memberB.id, p_product_id: b.productId, p_start_date: '2030-01-01', p_paid_amount: 0 },
      ],
      [
        'create_hold',
        { p_member_pass_id: memberB.passId, p_start_date: '2030-01-01', p_end_date: '2030-01-03' },
      ],
      ['create_member_invite', { p_member_id: memberB.id }],
      ['withdraw_member', { p_member_id: memberB.id }],
      ['today_summary', { p_center_id: b.centerId }],
      ['today_followups', { p_center_id: b.centerId }],
      ['center_stats', { p_center_id: b.centerId, p_unit: 'day', p_count: 7 }],
    ];
    for (const [fn, args] of attempts) {
      for (const user of [a.owner.userId, a.staff.userId]) {
        const code = await rpcError(user, fn, args);
        expect({ fn, code }).toEqual({ fn, code: expect.stringMatching(/^(FORBIDDEN|[A-Z_]+_NOT_FOUND)$/) });
      }
    }
    const [state] = await query<{ status: string; capacity: number }>(
      `select s.status::text, s.capacity from public.sessions s where s.id = $1`,
      [sessionB],
    );
    expect(state).toEqual({ status: 'scheduled', capacity: 10 });
    const [booking] = await query<{ status: string }>(
      `select status::text from public.bookings where id = $1`,
      [bookingB],
    );
    expect(booking?.status).toBe('booked');
  });

  it('회원은 다른 센터 수업을 예약하거나 다른 회원의 예약을 취소할 수 없다', async () => {
    const attempts: [string, Record<string, unknown>][] = [
      ['book_session', { p_session_id: sessionB }],
      ['preview_booking', { p_session_id: sessionB }],
      ['cancel_booking', { p_booking_id: bookingB }],
      ['cancel_booking', { p_booking_id: otherBookingA }],
      ['member_schedule', { p_center_id: b.centerId, p_from: '2030-01-01', p_to: '2030-01-02' }],
      ['member_bookings', { p_center_id: b.centerId, p_upcoming: true }],
      ['update_my_settings', { p_center_id: b.centerId, p_notify_enabled: false, p_marketing_agreed: false }],
      ['staff_book_for_member', { p_session_id: sessionB, p_member_id: memberA.id }],
    ];
    for (const [fn, args] of attempts) {
      const code = await rpcError(memberA.userId, fn, args);
      expect({ fn, code }).toEqual({ fn, code: expect.stringMatching(/^(FORBIDDEN|[A-Z_]+_NOT_FOUND)$/) });
    }
    const [booking] = await query<{ status: string }>(
      `select status::text from public.bookings where id = $1`,
      [otherBookingA],
    );
    expect(booking?.status).toBe('booked');
  });
});
