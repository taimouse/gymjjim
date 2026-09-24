import { beforeAll, describe, expect, it } from 'vitest';

import { createMember, createPass, createProduct, createSession } from './factories';
import { query, queryOne, rpc, rpcError, rpcRows } from './helpers';
import { addMember, type BookResult, remaining, type Scenario, setupScenario } from './scenario';

type MemberRow = {
  id: string;
  name: string;
  pass_state: string | null;
  pass_remaining: number | null;
  pass_days_left: number | null;
  total_count: string;
};

async function search(scenario: Scenario, args: Record<string, unknown> = {}) {
  return rpcRows<MemberRow>(scenario.staff.userId, 'search_members', {
    p_center_id: scenario.centerId,
    ...args,
  });
}

describe('search_members', () => {
  let scenario: Scenario;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    scenario = await setupScenario();
    const period = await createProduct(scenario.centerId, { type: 'period' });
    const make = async (
      key: string,
      name: string,
      pass?: Parameters<typeof createPass>[3],
      productId?: string,
    ) => {
      const member = await createMember(scenario.centerId, { name });
      ids[key] = member.id;
      if (pass) await createPass(scenario.centerId, member.id, productId ?? scenario.productId, pass);
      return member;
    };
    await make('fresh', '가나다', { endOffset: 60 });
    await make('expiring', '마바사', { endOffset: 5 });
    await make('low', '아자차', { endOffset: 40, remaining: 2 });
    await make('expired', '카타파', { startOffset: -60, endOffset: -3 });
    await make('none', '하하하');
    const hold = await make('hold', '정지중', { endOffset: 30 }, period);
    const [holdPass] = await query<{ id: string }>(
      `select id from public.member_passes where member_id = $1`,
      [hold.id],
    );
    await query(
      `insert into public.pass_holds (center_id, member_pass_id, start_date, end_date)
       values ($1, $2, (now() at time zone 'Asia/Seoul')::date - 1, (now() at time zone 'Asia/Seoul')::date + 3)`,
      [scenario.centerId, holdPass!.id],
    );
  });

  it('필터 칩: 활성 / 만료 임박 / 잔여 1~2회 / 만료 / 정지 중', async () => {
    const names = async (filter: string) =>
      (await search(scenario, { p_filter: filter })).map((r) => r.id).sort();
    expect(await names('expiring')).toEqual([ids.expiring]);
    expect(await names('low')).toEqual([ids.low]);
    expect(await names('expired')).toEqual([ids.expired]);
    expect(await names('hold')).toEqual([ids.hold]);
    expect(await names('active')).toEqual([ids.fresh, ids.expiring, ids.low].sort());
    expect(await names('none')).toEqual([ids.none]);
  });

  it('이름 또는 전화번호 뒷 4자리로 찾는다', async () => {
    const byName = await search(scenario, { p_query: '바사' });
    expect(byName.map((r) => r.id)).toEqual([ids.expiring]);
    const [target] = await query<{ phone_last4: string }>(
      `select phone_last4 from public.members where id = $1`,
      [ids.low],
    );
    const byLast4 = await search(scenario, { p_query: target!.phone_last4 });
    expect(byLast4.map((r) => r.id)).toContain(ids.low);
  });

  it('대표 이용권의 잔여·D-day 를 함께 돌려주고 페이지를 나눈다', async () => {
    const [low] = (await search(scenario, { p_filter: 'low' })) as MemberRow[];
    expect(low).toMatchObject({ pass_state: 'active', pass_remaining: 2, pass_days_left: 40 });
    const page = await search(scenario, { p_limit: 2, p_offset: 0 });
    expect(page).toHaveLength(2);
    expect(Number(page[0]!.total_count)).toBe(6);
  });

  it('다른 센터 직원에게는 보이지 않는다', async () => {
    const other = await setupScenario();
    const rows = await rpcRows(other.staff.userId, 'search_members', { p_center_id: scenario.centerId });
    expect(rows).toEqual([]);
  });
});

describe('grant_member_pass', () => {
  it('상품 기준으로 만료일·횟수를 계산하고 결제 금액을 기록한다', async () => {
    const scenario = await setupScenario({
      product: { type: 'period_count', durationDays: 60, totalCount: 10 },
    });
    const member = await createMember(scenario.centerId);
    const result = await rpc<{
      member_pass_id: string;
      start_date: string;
      end_date: string;
      total_count: number;
    }>(scenario.staff.userId, 'grant_member_pass', {
      p_member_id: member.id,
      p_product_id: scenario.productId,
      p_start_date: '2026-10-01',
      p_paid_amount: 180000,
    });
    expect(result).toMatchObject({ start_date: '2026-10-01', end_date: '2026-11-29', total_count: 10 });
    const row = await queryOne<{ paid_amount: number; remaining_count: number; name: string }>(
      `select paid_amount, remaining_count, name from public.member_passes where id = $1`,
      [result.member_pass_id],
    );
    expect(row).toMatchObject({ paid_amount: 180000, remaining_count: 10 });
  });

  it('회원은 스스로 이용권을 부여할 수 없다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const error = await rpcError(member.userId, 'grant_member_pass', {
      p_member_id: member.id,
      p_product_id: scenario.productId,
      p_start_date: '2026-10-01',
      p_paid_amount: 0,
    });
    expect(error).toBe('FORBIDDEN');
  });
});

describe('withdraw_member (삭제 요청)', () => {
  it('개인정보를 지우고 앞으로의 예약은 취소·복구하며 지난 기록은 남긴다', async () => {
    const scenario = await setupScenario();
    const member = await addMember(scenario);
    const future = await createSession(scenario.centerId, scenario.programId);
    const booked = await rpc<BookResult>(member.userId, 'book_session', { p_session_id: future });
    expect(await remaining(member.passId)).toBe(9);

    expect(await rpcError(scenario.staff.userId, 'withdraw_member', { p_member_id: member.id })).toBe(
      'FORBIDDEN',
    );
    const result = await rpc(scenario.owner.userId, 'withdraw_member', { p_member_id: member.id });
    expect(result).toEqual({ member_id: member.id, cancelled_bookings: 1 });

    const row = await queryOne<{
      name: string;
      phone: string | null;
      status: string;
      user_id: string | null;
    }>(`select name, phone, status, user_id from public.members where id = $1`, [member.id]);
    expect(row).toEqual({ name: '회*', phone: null, status: 'withdrawn', user_id: null });
    expect(await remaining(member.passId)).toBe(10);
    const [booking] = await query<{ status: string }>(`select status from public.bookings where id = $1`, [
      booked.booking_id,
    ]);
    expect(booking!.status).toBe('cancelled');
  });
});

describe('import_members (CSV)', () => {
  it('새 회원을 넣고 이미 있는 전화번호는 건너뛴다', async () => {
    const scenario = await setupScenario();
    const existing = await createMember(scenario.centerId);
    const result = await rpc<{ inserted: number; skipped: string[] }>(
      scenario.staff.userId,
      'import_members',
      {
        p_center_id: scenario.centerId,
        p_rows: JSON.stringify([
          { name: '새회원', phone: '01077778888', birth: '1990-05-01', gender: 'female', tags: ['아침반'] },
          { name: '중복', phone: existing.phone },
        ]),
      },
    );
    expect(result).toEqual({ inserted: 1, skipped: [existing.phone] });
    const row = await queryOne<{ tags: string[]; privacy: boolean }>(
      `select tags, privacy_agreed_at is not null as privacy from public.members where phone = '01077778888'`,
    );
    expect(row).toEqual({ tags: ['아침반'], privacy: true });
  });

  it('다른 센터에는 가져올 수 없다 (RLS)', async () => {
    const scenario = await setupScenario();
    const other = await setupScenario();
    const error = await rpcError(other.staff.userId, 'import_members', {
      p_center_id: scenario.centerId,
      p_rows: JSON.stringify([{ name: '침입', phone: '01011110000' }]),
    });
    expect(error).toMatch(/row-level security/);
  });
});
