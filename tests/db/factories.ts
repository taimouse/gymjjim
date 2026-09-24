import { randomUUID } from 'node:crypto';

import { query, queryOne } from './helpers';

// 테스트마다 독립된 센터를 만들어 데이터가 서로 섞이지 않게 한다.

let phoneSeq = 0;
function uniquePhone(): string {
  phoneSeq += 1;
  const base = (Date.now() % 1_000_000) * 100 + (phoneSeq % 100);
  return `010${String(base).padStart(8, '0').slice(-8)}`;
}

export async function createUser(email = `${randomUUID()}@test.gymjjim`): Promise<string> {
  const id = randomUUID();
  await query(
    `insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
       '{"provider":"email"}', '{}', now(), now())`,
    [id, email],
  );
  return id;
}

export interface BookingSettings {
  open_days_before: number;
  close_minutes_before: number;
  free_cancel_hours_before: number;
  auto_promote_waitlist: boolean;
}

export async function createCenter(settings: Partial<BookingSettings> = {}): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `insert into public.centers (name, booking_settings)
     values ($1, jsonb_build_object(
       'open_days_before', 7, 'close_minutes_before', 30,
       'free_cancel_hours_before', 3, 'auto_promote_waitlist', true) || $2::jsonb)
     returning id`,
    [`테스트센터-${randomUUID().slice(0, 8)}`, JSON.stringify(settings)],
  );
  return row.id;
}

export async function createStaff(
  centerId: string,
  role: 'owner' | 'staff' = 'staff',
): Promise<{ id: string; userId: string }> {
  const userId = await createUser();
  const row = await queryOne<{ id: string }>(
    `insert into public.staff (center_id, user_id, role, name) values ($1, $2, $3, $4) returning id`,
    [centerId, userId, role, role === 'owner' ? '대표' : '코치'],
  );
  return { id: row.id, userId };
}

export async function createMember(
  centerId: string,
  options: { withUser?: boolean; notifyEnabled?: boolean; name?: string } = {},
): Promise<{ id: string; userId: string | null; phone: string }> {
  const userId = options.withUser === false ? null : await createUser();
  const phone = uniquePhone();
  const row = await queryOne<{ id: string }>(
    `insert into public.members (center_id, user_id, name, phone, privacy_agreed_at, notify_enabled)
     values ($1, $2, $3, $4, now(), $5) returning id`,
    [centerId, userId, options.name ?? '회원', phone, options.notifyEnabled ?? true],
  );
  return { id: row.id, userId, phone };
}

export interface ProductOptions {
  type?: 'period' | 'count' | 'period_count';
  durationDays?: number | null;
  totalCount?: number | null;
  limitCount?: number | null;
  limitUnit?: 'week' | 'month' | null;
  price?: number;
}

export async function createProduct(centerId: string, options: ProductOptions = {}): Promise<string> {
  const type = options.type ?? 'period_count';
  const durationDays =
    options.durationDays !== undefined ? options.durationDays : type === 'count' ? null : 30;
  const totalCount = options.totalCount !== undefined ? options.totalCount : type === 'period' ? null : 10;
  const row = await queryOne<{ id: string }>(
    `insert into public.pass_products (center_id, name, type, duration_days, total_count,
       period_limit_count, period_limit_unit, price)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [
      centerId,
      `상품-${type}`,
      type,
      durationDays,
      totalCount,
      options.limitCount ?? null,
      options.limitUnit ?? null,
      options.price ?? 100000,
    ],
  );
  return row.id;
}

export async function createProgram(
  centerId: string,
  options: { productIds?: string[]; capacity?: number; durationMin?: number } = {},
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `insert into public.programs (center_id, name, default_capacity, duration_min)
     values ($1, '테스트 수업', $2, $3) returning id`,
    [centerId, options.capacity ?? 10, options.durationMin ?? 60],
  );
  for (const productId of options.productIds ?? []) {
    await query(
      `insert into public.program_allowed_products (center_id, program_id, product_id) values ($1, $2, $3)`,
      [centerId, row.id, productId],
    );
  }
  return row.id;
}

/** 지금부터 startsInMinutes 분 뒤에 시작하는 세션 */
export async function createSession(
  centerId: string,
  programId: string,
  options: { startsInMinutes?: number; durationMin?: number; capacity?: number; instructorId?: string } = {},
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `insert into public.sessions (center_id, program_id, instructor_id, starts_at, ends_at, capacity)
     values ($1, $2, $3, now() + make_interval(mins => $4), now() + make_interval(mins => $4 + $5), $6)
     returning id`,
    [
      centerId,
      programId,
      options.instructorId ?? null,
      options.startsInMinutes ?? 24 * 60,
      options.durationMin ?? 60,
      options.capacity ?? 10,
    ],
  );
  return row.id;
}

/** 이용권을 직접 넣는다. 날짜는 오늘(Asia/Seoul) 기준 일수 */
export async function createPass(
  centerId: string,
  memberId: string,
  productId: string,
  options: { startOffset?: number; endOffset?: number | null; remaining?: number } = {},
): Promise<string> {
  const product = await queryOne<{
    name: string;
    type: string;
    total_count: number | null;
    period_limit_count: number | null;
    period_limit_unit: string | null;
  }>(
    `select name, type, total_count, period_limit_count, period_limit_unit from public.pass_products where id = $1`,
    [productId],
  );
  const endOffset =
    options.endOffset !== undefined ? options.endOffset : product.type === 'count' ? null : 30;
  const row = await queryOne<{ id: string }>(
    `insert into public.member_passes (center_id, member_id, product_id, name, type, start_date, end_date,
       total_count, remaining_count, period_limit_count, period_limit_unit)
     values ($1, $2, $3, $4, $5,
       (now() at time zone 'Asia/Seoul')::date + $6::int,
       case when $7::int is null then null else (now() at time zone 'Asia/Seoul')::date + $7::int end,
       $8, $9, $10, $11)
     returning id`,
    [
      centerId,
      memberId,
      productId,
      product.name,
      product.type,
      options.startOffset ?? -1,
      endOffset,
      product.total_count,
      product.total_count === null ? null : (options.remaining ?? product.total_count),
      product.period_limit_count,
      product.period_limit_unit,
    ],
  );
  return row.id;
}
