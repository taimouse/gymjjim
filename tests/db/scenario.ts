import {
  type BookingSettings,
  createCenter,
  createMember,
  createPass,
  createProduct,
  createProgram,
  createStaff,
  type ProductOptions,
} from './factories';
import { query, queryOne } from './helpers';

export interface Scenario {
  centerId: string;
  owner: { id: string; userId: string };
  staff: { id: string; userId: string };
  productId: string;
  programId: string;
}

/** 센터 + 대표·직원 + 상품 1개 + 그 상품을 쓸 수 있는 프로그램 1개 */
export async function setupScenario(
  options: { settings?: Partial<BookingSettings>; product?: ProductOptions; capacity?: number } = {},
): Promise<Scenario> {
  const centerId = await createCenter(options.settings);
  const owner = await createStaff(centerId, 'owner');
  const staff = await createStaff(centerId, 'staff');
  const productId = await createProduct(centerId, options.product);
  const programId = await createProgram(centerId, { productIds: [productId], capacity: options.capacity });
  return { centerId, owner, staff, productId, programId };
}

export interface TestMember {
  id: string;
  userId: string;
  passId: string;
}

/** 로그인 계정이 있는 회원 + 시나리오 상품의 이용권 */
export async function addMember(
  scenario: Scenario,
  pass: { startOffset?: number; endOffset?: number | null; remaining?: number; productId?: string } = {},
): Promise<TestMember> {
  const member = await createMember(scenario.centerId);
  const passId = await createPass(scenario.centerId, member.id, pass.productId ?? scenario.productId, pass);
  return { id: member.id, userId: member.userId!, passId };
}

/** 센터 시간대 기준 dayOffset 일 뒤 localTime 에 시작하는 세션 */
export async function createSessionAt(
  scenario: Scenario,
  options: { dayOffset: number; localTime: string; durationMin?: number; capacity?: number },
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `insert into public.sessions (center_id, program_id, starts_at, ends_at, capacity)
     select $1, $2, t.starts_at, t.starts_at + make_interval(mins => $5), $6
     from (select (((now() at time zone 'Asia/Seoul')::date + $3::int) + $4::time) at time zone 'Asia/Seoul'
             as starts_at) t
     returning id`,
    [
      scenario.centerId,
      scenario.programId,
      options.dayOffset,
      options.localTime,
      options.durationMin ?? 60,
      options.capacity ?? 10,
    ],
  );
  return row.id;
}

export async function remaining(passId: string): Promise<number | null> {
  const row = await queryOne<{ remaining_count: number | null }>(
    `select remaining_count from public.member_passes where id = $1`,
    [passId],
  );
  return row.remaining_count;
}

export async function bookingStatus(
  bookingId: string,
): Promise<{ status: string; waitlist_position: number | null }> {
  return queryOne(`select status, waitlist_position from public.bookings where id = $1`, [bookingId]);
}

export async function sessionCounts(
  sessionId: string,
): Promise<{ booked_count: number; waitlist_count: number }> {
  return queryOne(`select booked_count, waitlist_count from public.sessions where id = $1`, [sessionId]);
}

export async function notifications(memberId: string, type?: string) {
  return query<{ type: string; status: string }>(
    `select type, status from public.notification_logs where member_id = $1 and ($2::text is null or type = $2)
     order by created_at`,
    [memberId, type ?? null],
  );
}

export interface BookResult {
  booking_id: string;
  status: 'booked' | 'waitlisted';
  waitlist_position: number | null;
  member_pass_id: string;
  remaining_count: number | null;
}
