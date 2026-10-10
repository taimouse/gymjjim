/**
 * 처음 데이터: supabase/seed.sql · seed/*.sql 과 같은 센터·직원·회원·이용권·프로그램·수업·예약.
 * 날짜는 모두 "오늘" 기준이라 언제 열어도 이번 주·다음 주 시간표가 보인다.
 */
import { addDays, startOfISOWeek } from 'date-fns';

import { localToUtc } from '@/features/sessions/recurrence';
import { addDaysToKey, toDateKey } from '@/lib/format';

import type { Row, Tables } from './db';
import { applyDefaults } from './defaults';
import { seedBookings } from './seed-bookings';
import { MEMBERS, TAGS, PRODUCTS, PROGRAMS, ALLOWED, PASSES, TEMPLATE } from './seed-data';

const TZ = 'Asia/Seoul';

/** 센터 기본 정보 (첫 화면에서도 쓴다) */
export const CENTER_INFO = {
  name: '재키 피트니스 구미점',
  phone: '050713743962',
  address: '경상북도 구미시 상사동로 58 (임은동)',
};
const CENTER = 'c0000000-0000-4000-8000-000000000001';
const id = (prefix: string, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const staffId = (n: number) => id('b', n);
const memberId = (n: number) => id('d', n);
const productId = (n: number) => id('e', n);
const programId = (n: number) => id('f', n);

const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const row = (table: string, values: Row) => applyDefaults(table, values);

export function createSeed(now: Date = new Date()): Tables {
  const today = toDateKey(now, TZ);
  const nowIso = now.toISOString();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  const centers = [
    {
      id: CENTER,
      ...CENTER_INFO,
      timezone: TZ,
      booking_settings: {
        open_days_before: 7,
        close_minutes_before: 30,
        free_cancel_hours_before: 3,
        auto_promote_waitlist: true,
      },
      notify_sms_fallback: false,
      status: 'active',
      plan_id: 'plan-basic',
      trial_ends_at: null,
      deleted_at: null,
      created_at: daysAgo(400),
      updated_at: nowIso,
    },
  ];
  const plans = [
    {
      id: 'plan-basic',
      code: 'basic',
      name: '베이직',
      monthly_price: 49000,
      max_members: 300,
      max_staff: 5,
      is_active: true,
    },
  ];
  const staff = [
    ['김대표', 'owner', 'owner@gymjjim.test', '01011112222', '#4F46E5'],
    ['이코치', 'staff', 'coach.lee@gymjjim.test', '01022223333', '#0EA5E9'],
    ['박코치', 'staff', 'coach.park@gymjjim.test', '01033334444', '#F97316'],
  ].map(([name, role, email, phone, color], i) =>
    row('staff', {
      id: staffId(i + 1),
      center_id: CENTER,
      user_id: id('a', i + 1),
      name,
      role,
      email,
      phone,
      color,
      created_at: daysAgo(400 - i),
      updated_at: nowIso,
    }),
  );
  const members = MEMBERS.map(([name, gender], index) => {
    const i = index + 1;
    const joined = i > 25 ? daysAgo(i - 26) : daysAgo(40 + ((i * 13) % 300));
    return row('members', {
      id: memberId(i),
      center_id: CENTER,
      user_id: i <= 2 ? id('a', 100 + i) : null,
      name,
      phone: `010${String((i * 7919 + 1234) % 10000).padStart(4, '0')}${String((i * 4729 + 5678) % 10000).padStart(4, '0')}`,
      birth: addDaysToKey('1978-03-01', (i * 397) % 9000),
      gender,
      tags: TAGS[i % 5],
      joined_at: joined,
      privacy_agreed_at: joined,
      marketing_agreed_at: i % 3 === 0 ? joined : null,
      // 회원 화면의 홍길동은 가입 동의 전으로 시작한다 (처리방침을 끝까지 읽는 동의 흐름을 보여 주려고)
      onboarded_at: null,
      created_at: joined,
      updated_at: nowIso,
    });
  });
  const products = PRODUCTS.map(([name, type, days, total, limit, price], i) =>
    row('pass_products', {
      id: productId(i + 1),
      center_id: CENTER,
      name,
      type,
      duration_days: days,
      total_count: total,
      period_limit_count: limit,
      period_limit_unit: limit ? 'week' : null,
      price,
      sort_order: i + 1,
      created_at: daysAgo(400),
      updated_at: nowIso,
    }),
  );
  const programs = PROGRAMS.map(([name, type, capacity, minutes, color, description, instructor, cost], i) =>
    row('programs', {
      id: programId(i + 1),
      center_id: CENTER,
      name,
      type,
      default_capacity: capacity,
      duration_min: minutes,
      color,
      description,
      default_instructor_id: staffId(instructor),
      pass_cost: cost,
      sort_order: i + 1,
      created_at: daysAgo(400),
      updated_at: nowIso,
    }),
  );
  const allowed = ALLOWED.map(([program, product]) => ({
    center_id: CENTER,
    program_id: programId(program),
    product_id: productId(product),
    created_at: daysAgo(400),
  }));
  const passes = PASSES.map(([member, product, start, end, remaining], i) => {
    const p = products[product - 1]!;
    const startKey = addDaysToKey(today, start);
    return row('member_passes', {
      id: id('9', i + 1),
      center_id: CENTER,
      member_id: memberId(member),
      product_id: p.id,
      name: p.name,
      type: p.type,
      start_date: startKey,
      end_date: end === null ? null : addDaysToKey(today, end),
      total_count: p.total_count,
      remaining_count: p.total_count === null ? null : remaining,
      period_limit_count: p.period_limit_count,
      period_limit_unit: p.period_limit_unit,
      paid_amount: p.price,
      paid_at: localToUtc(startKey, '10:00', TZ),
      created_by: staffId(1),
      created_at: localToUtc(startKey, '10:00', TZ),
      updated_at: nowIso,
    });
  });
  const holdPass = passes.find((p) => p.member_id === memberId(9))!;
  const holds = [
    row('pass_holds', {
      id: id('8', 1),
      center_id: CENTER,
      member_pass_id: holdPass.id,
      start_date: addDaysToKey(today, -1),
      end_date: addDaysToKey(today, 5),
      reason: '해외 출장',
      created_by: staffId(1),
      created_at: daysAgo(1),
    }),
  ];

  const monday = startOfISOWeek(new Date(`${today}T00:00:00`));
  const sessions: Row[] = [];
  TEMPLATE.forEach(([program, instructor, weekdays, time, minutes, capacity], t) => {
    for (let offset = 0; offset < 14; offset += 1) {
      const day = addDays(monday, offset);
      if (!weekdays.includes(((day.getDay() + 6) % 7) + 1)) continue;
      const startsAt = localToUtc(keyOf(day), time, TZ);
      sessions.push(
        row('sessions', {
          id: id('7', t * 100 + offset),
          center_id: CENTER,
          program_id: programId(program),
          instructor_id: staffId(instructor),
          starts_at: startsAt,
          ends_at: new Date(Date.parse(startsAt) + minutes * 60_000).toISOString(),
          capacity,
          recurrence_group_id: id('6', t + 1),
          created_by: staffId(1),
          created_at: daysAgo(30),
          updated_at: nowIso,
        }),
      );
    }
  });
  sessions.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));

  const bookings = seedBookings({ sessions, passes, holds, allowed, programs, now });
  return {
    centers,
    plans,
    staff,
    members,
    pass_products: products,
    programs,
    program_allowed_products: allowed,
    member_passes: passes,
    pass_holds: holds,
    sessions,
    bookings,
    notification_logs: [],
    member_invites: [],
  };
}
