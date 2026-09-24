import { describe, expect, it } from 'vitest';

import { createCenter, createMember, createPass, createProduct, createStaff } from './factories';
import { expectDbError, query, queryOne } from './helpers';

const SEED_CENTER = 'c0000000-0000-4000-8000-000000000001';

describe('시드', () => {
  it('센터 1 · 대표 1 · 직원 2 · 회원 30 · 상품 4 · 프로그램 5', async () => {
    const row = await queryOne<Record<string, number>>(
      `select
         (select count(*)::int from public.centers where id = $1) as centers,
         (select count(*)::int from public.staff where center_id = $1 and role = 'owner') as owners,
         (select count(*)::int from public.staff where center_id = $1 and role = 'staff') as staff,
         (select count(*)::int from public.members where center_id = $1) as members,
         (select count(*)::int from public.pass_products where center_id = $1) as products,
         (select count(*)::int from public.programs where center_id = $1) as programs`,
      [SEED_CENTER],
    );
    expect(row).toEqual({ centers: 1, owners: 1, staff: 2, members: 30, products: 4, programs: 5 });
  });

  it('이번 주 월요일부터 다음 주 일요일까지 세션이 있다', async () => {
    const row = await queryOne<{ first: string; last: string; monday: string }>(
      `select min((starts_at at time zone 'Asia/Seoul')::date)::text as first,
              max((starts_at at time zone 'Asia/Seoul')::date)::text as last,
              date_trunc('week', now() at time zone 'Asia/Seoul')::date::text as monday
       from public.sessions where center_id = $1`,
      [SEED_CENTER],
    );
    expect(row.first).toBe(row.monday);
    const days = (Date.parse(row.last) - Date.parse(row.monday)) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(12);
    expect(days).toBeLessThanOrEqual(13);
  });

  it('세션 카운터가 예약 기록과 일치하고 정원을 넘지 않는다', async () => {
    const mismatches = await query(
      `select s.id from public.sessions s
       where s.center_id = $1 and (
         s.booked_count <> (select count(*) from public.bookings b
                            where b.session_id = s.id and b.status in ('booked','attended','no_show'))
         or s.waitlist_count <> (select count(*) from public.bookings b
                                 where b.session_id = s.id and b.status = 'waitlisted')
         or s.booked_count > s.capacity)`,
      [SEED_CENTER],
    );
    expect(mismatches).toEqual([]);
  });

  it('대기 순번은 세션마다 1부터 빈틈없이 매겨진다', async () => {
    const broken = await query(
      `select session_id from public.bookings where status = 'waitlisted' and center_id = $1
       group by session_id having max(waitlist_position) <> count(*) or min(waitlist_position) <> 1`,
      [SEED_CENTER],
    );
    expect(broken).toEqual([]);
  });

  it('로그인 계정의 역할이 app_metadata 에 동기화된다', async () => {
    const rows = await query<{ email: string; roles: { staff: unknown[]; member: unknown[] } }>(
      `select email, raw_app_meta_data -> 'gymjjim' as roles from auth.users
       where email in ('owner@gymjjim.test', 'member1@gymjjim.test') order by email`,
    );
    expect(rows[0]!.roles.member).toHaveLength(1);
    expect(rows[1]!.roles.staff).toEqual([{ center_id: SEED_CENTER, role: 'owner' }]);
  });
});

describe('제약 조건', () => {
  it('전화번호는 숫자만 저장하고 뒷 4자리 컬럼이 자동 생성된다', async () => {
    const centerId = await createCenter();
    const member = await createMember(centerId);
    const row = await queryOne<{ phone_last4: string }>(
      `select phone_last4 from public.members where id = $1`,
      [member.id],
    );
    expect(row.phone_last4).toBe(member.phone.slice(-4));

    const error = await expectDbError(
      query(
        `insert into public.members (center_id, name, phone, privacy_agreed_at) values ($1, '하이픈', '010-1234-5678', now())`,
        [centerId],
      ),
    );
    expect(error).toMatch(/check constraint/);
  });

  it('같은 센터에 같은 전화번호로 두 번 등록할 수 없다', async () => {
    const centerId = await createCenter();
    const member = await createMember(centerId);
    const error = await expectDbError(
      query(
        `insert into public.members (center_id, name, phone, privacy_agreed_at) values ($1, '중복', $2, now())`,
        [centerId, member.phone],
      ),
    );
    expect(error).toMatch(/members_center_phone_uniq/);
  });

  it('개인정보 동의 일시 없이 활성 회원을 만들 수 없다', async () => {
    const centerId = await createCenter();
    const error = await expectDbError(
      query(`insert into public.members (center_id, name, phone) values ($1, '미동의', '01099990000')`, [
        centerId,
      ]),
    );
    expect(error).toMatch(/members_active_requires_privacy/);
  });

  it('상품 유형에 맞는 기간·횟수가 있어야 한다', async () => {
    const centerId = await createCenter();
    const error = await expectDbError(
      query(
        `insert into public.pass_products (center_id, name, type, duration_days, total_count) values ($1, '잘못', 'period', 30, 10)`,
        [centerId],
      ),
    );
    expect(error).toMatch(/pass_products_type_fields/);
  });

  it('다른 센터의 회원·상품을 참조하는 이용권은 만들 수 없다', async () => {
    const centerA = await createCenter();
    const centerB = await createCenter();
    const memberB = await createMember(centerB);
    const productA = await createProduct(centerA);
    const error = await expectDbError(createPass(centerA, memberB.id, productA));
    expect(error).toMatch(/member_passes_member_fk/);
  });

  it('같은 이용권의 정지 기간은 겹칠 수 없다', async () => {
    const centerId = await createCenter();
    const member = await createMember(centerId);
    const passId = await createPass(centerId, member.id, await createProduct(centerId));
    await query(
      `insert into public.pass_holds (center_id, member_pass_id, start_date, end_date) values ($1, $2, '2030-01-01', '2030-01-10')`,
      [centerId, passId],
    );
    const error = await expectDbError(
      query(
        `insert into public.pass_holds (center_id, member_pass_id, start_date, end_date) values ($1, $2, '2030-01-10', '2030-01-12')`,
        [centerId, passId],
      ),
    );
    expect(error).toMatch(/pass_holds_no_overlap/);
  });

  it('센터 시간대는 실제 존재하는 이름이어야 한다', async () => {
    const error = await expectDbError(
      query(`insert into public.centers (name, timezone) values ('x', 'Mars/Base')`),
    );
    expect(error).toBe('INVALID_TIMEZONE');
  });

  it('직원 행을 연결하면 역할 클레임이 갱신된다', async () => {
    const centerId = await createCenter();
    const staff = await createStaff(centerId, 'owner');
    const row = await queryOne<{ roles: { staff: { center_id: string; role: string }[] } }>(
      `select raw_app_meta_data -> 'gymjjim' as roles from auth.users where id = $1`,
      [staff.userId],
    );
    expect(row.roles.staff).toEqual([{ center_id: centerId, role: 'owner' }]);
  });
});
