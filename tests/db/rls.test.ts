import { beforeAll, describe, expect, it } from 'vitest';

import {
  createCenter,
  createMember,
  createPass,
  createProduct,
  createProgram,
  createSession,
  createStaff,
} from './factories';
import { expectDbError, query, withUser } from './helpers';

// 센터 A·B 를 만들고, A 의 직원·회원이 B 의 데이터와 서로의 데이터에 접근할 수 없는지 확인한다.
let centerA: string;
let centerB: string;
let ownerA: { id: string; userId: string };
let staffA: { id: string; userId: string };
let staffB: { id: string; userId: string };
let memberA1: { id: string; userId: string | null };
let memberA2: { id: string; userId: string | null };
let productA: string;
let sessionA: string;
let sessionB: string;

beforeAll(async () => {
  centerA = await createCenter();
  centerB = await createCenter();
  ownerA = await createStaff(centerA, 'owner');
  staffA = await createStaff(centerA, 'staff');
  staffB = await createStaff(centerB, 'owner');
  memberA1 = await createMember(centerA);
  memberA2 = await createMember(centerA);
  const memberB = await createMember(centerB);

  productA = await createProduct(centerA);
  const productB = await createProduct(centerB);
  const programA = await createProgram(centerA, { productIds: [productA] });
  const programB = await createProgram(centerB, { productIds: [productB] });
  sessionA = await createSession(centerA, programA);
  sessionB = await createSession(centerB, programB);

  const passA1 = await createPass(centerA, memberA1.id, productA);
  const passA2 = await createPass(centerA, memberA2.id, productA);
  const passB = await createPass(centerB, memberB.id, productB);
  for (const [center, session, member, pass] of [
    [centerA, sessionA, memberA1.id, passA1],
    [centerA, sessionA, memberA2.id, passA2],
    [centerB, sessionB, memberB.id, passB],
  ] as const) {
    await query(
      `insert into public.bookings (center_id, session_id, member_id, member_pass_id, status) values ($1, $2, $3, $4, 'booked')`,
      [center, session, member, pass],
    );
  }
});

async function count(userId: string | null, table: string, where = 'true', params: unknown[] = []) {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from public.${table} where ${where}`,
      params,
    );
    return rows[0]!.n;
  });
}

describe('anon', () => {
  it('어떤 업무 테이블도 읽을 수 없다', async () => {
    for (const table of ['centers', 'members', 'sessions', 'bookings', 'member_passes', 'programs']) {
      const error = await expectDbError(count(null, table));
      expect(error).toMatch(/permission denied/);
    }
  });
});

describe('staff', () => {
  it('자기 센터 데이터만 본다', async () => {
    expect(await count(staffA.userId, 'members', 'center_id = $1', [centerB])).toBe(0);
    expect(await count(staffA.userId, 'sessions', 'center_id = $1', [centerB])).toBe(0);
    expect(await count(staffA.userId, 'bookings', 'center_id = $1', [centerB])).toBe(0);
    expect(await count(staffA.userId, 'members', 'center_id = $1', [centerA])).toBe(2);
    expect(await count(staffA.userId, 'bookings', 'center_id = $1', [centerA])).toBe(2);
    expect(await count(staffB.userId, 'members', 'center_id = $1', [centerA])).toBe(0);
  });

  it('다른 센터에 회원을 등록할 수 없다', async () => {
    const error = await expectDbError(
      withUser(staffA.userId, (client) =>
        client.query(
          `insert into public.members (center_id, name, phone, privacy_agreed_at) values ($1, '침입', '01000000001', now())`,
          [centerB],
        ),
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it('예약·세션 카운터를 직접 바꿀 수 없다 (RPC 전용)', async () => {
    const bookingError = await expectDbError(
      withUser(staffA.userId, (client) =>
        client.query(`update public.bookings set status = 'attended' where session_id = $1`, [sessionA]),
      ),
    );
    expect(bookingError).toMatch(/permission denied/);
    const sessionError = await expectDbError(
      withUser(staffA.userId, (client) =>
        client.query(`update public.sessions set booked_count = 0 where id = $1`, [sessionA]),
      ),
    );
    expect(sessionError).toMatch(/permission denied/);
  });

  it('회원을 삭제(deleted_at)할 수 없다', async () => {
    const error = await expectDbError(
      withUser(staffA.userId, (client) =>
        client.query(`update public.members set deleted_at = now() where id = $1`, [memberA1.id]),
      ),
    );
    expect(error).toMatch(/permission denied/);
  });

  it('이용권 상품은 대표만 수정한다', async () => {
    const byStaff = await withUser(staffA.userId, (client) =>
      client.query(`update public.pass_products set price = 1 where id = $1`, [productA]),
    );
    expect(byStaff.rowCount).toBe(0);
    const byOwner = await withUser(ownerA.userId, (client) =>
      client.query(`update public.pass_products set price = 120000 where id = $1`, [productA]),
    );
    expect(byOwner.rowCount).toBe(1);
  });

  it('마지막 대표는 강등할 수 없다', async () => {
    const error = await expectDbError(
      withUser(ownerA.userId, (client) =>
        client.query(`update public.staff set role = 'staff' where id = $1`, [ownerA.id]),
      ),
    );
    expect(error).toBe('LAST_OWNER');
  });
});

describe('member', () => {
  it('본인 예약·이용권만 본다', async () => {
    const userId = memberA1.userId!;
    expect(await count(userId, 'bookings')).toBe(1);
    expect(await count(userId, 'bookings', 'member_id = $1', [memberA2.id])).toBe(0);
    expect(await count(userId, 'member_passes')).toBe(1);
  });

  it('회원 명부(members)는 직접 조회할 수 없다 — 메모·태그는 내부 정보', async () => {
    expect(await count(memberA1.userId, 'members')).toBe(0);
  });

  it('자기 센터 수업만 본다', async () => {
    expect(await count(memberA1.userId, 'sessions', 'id = $1', [sessionA])).toBe(1);
    expect(await count(memberA1.userId, 'sessions', 'id = $1', [sessionB])).toBe(0);
    expect(await count(memberA1.userId, 'centers')).toBe(1);
  });

  it('예약을 직접 넣거나 바꿀 수 없다 (RPC 전용)', async () => {
    const error = await expectDbError(
      withUser(memberA1.userId, (client) =>
        client.query(
          `insert into public.bookings (center_id, session_id, member_id, status) values ($1, $2, $3, 'booked')`,
          [centerA, sessionA, memberA1.id],
        ),
      ),
    );
    expect(error).toMatch(/permission denied/);
  });

  it('직원 목록을 볼 수 없다', async () => {
    expect(await count(memberA1.userId, 'staff')).toBe(0);
  });
});
