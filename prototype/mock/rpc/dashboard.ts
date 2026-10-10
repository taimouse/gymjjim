/** 관리자 "오늘"·설정 조회 RPC (today_summary · today_followups · center_stats · center_plan_usage) */
import { byId, CENTER_ID, raise, type Row, table } from '../db';
import { addDaysToKey, daysBetween, localDate, ms, now, passState, today } from './helpers';

type Args = Record<string, unknown>;

const SEATED = ['booked', 'attended', 'no_show'];

function scheduledBookings() {
  return table('bookings')
    .map((b) => ({ b, s: byId('sessions', b.session_id) }))
    .filter((x): x is { b: Row; s: Row } => !!x.s && !x.s.deleted_at && x.s.status === 'scheduled');
}

/** 같은 회원의 더 먼저 등록된 이용권이 있으면 재등록 */
function isRenewal(pass: Row): boolean {
  return table('member_passes').some(
    (other) =>
      other.member_id === pass.member_id &&
      other.id !== pass.id &&
      !other.deleted_at &&
      String(other.created_at) < String(pass.created_at),
  );
}

const activeMembers = () =>
  table('members').filter((m) => m.center_id === CENTER_ID && !m.deleted_at && m.status === 'active');

function followups(a: Args): Row[] {
  const date = today();
  const limit = Math.min(Math.max(Number(a.p_limit ?? 20), 1), 100);
  const members = new Map(activeMembers().map((m) => [m.id, m]));
  const passes = table('member_passes')
    .filter((p) => p.status === 'active' && !p.deleted_at && members.has(p.member_id))
    .map((p) => ({ p, state: passState(p, date) }));
  const renewed = new Set(
    passes
      .filter(
        ({ p, state }) =>
          ['active', 'upcoming', 'on_hold'].includes(state) &&
          (!p.end_date || String(p.end_date) > addDaysToKey(date, 7)) &&
          (p.remaining_count === null || Number(p.remaining_count) > 2),
      )
      .map(({ p }) => p.member_id),
  );
  const row = (reason: string, p: Row, urgency: number, lastAt: unknown = null) => {
    const member = members.get(p.member_id)!;
    return {
      reason,
      member_id: p.member_id,
      name: member.name,
      phone: member.phone,
      pass_id: p.id,
      pass_name: p.name,
      days_left: p.end_date ? daysBetween(date, String(p.end_date)) : null,
      remaining: p.remaining_count,
      last_attended_at: lastAt,
      urgency,
    };
  };
  const expiring = passes
    .filter(
      ({ p, state }) =>
        state === 'active' &&
        p.end_date &&
        String(p.end_date) >= date &&
        String(p.end_date) <= addDaysToKey(date, 7) &&
        !renewed.has(p.member_id),
    )
    .map(({ p }) => row('expiring', p, daysBetween(date, String(p.end_date))));
  const low = passes
    .filter(
      ({ p, state }) =>
        state === 'active' &&
        p.remaining_count !== null &&
        Number(p.remaining_count) >= 1 &&
        Number(p.remaining_count) <= 2 &&
        !renewed.has(p.member_id),
    )
    .map(({ p }) => row('low', p, Number(p.remaining_count)));
  const inactive: ReturnType<typeof row>[] = [];
  for (const memberId of members.keys()) {
    const pass = passes
      .filter(
        ({ p, state }) =>
          p.member_id === memberId && state === 'active' && String(p.start_date) <= addDaysToKey(date, -14),
      )
      .map(({ p }) => p)
      .sort((x, y) => String(x.end_date ?? '9999').localeCompare(String(y.end_date ?? '9999')))[0];
    if (!pass) continue;
    const attended = table('bookings')
      .filter((b) => b.member_id === memberId && b.status === 'attended')
      .map((b) => String(byId('sessions', b.session_id)?.starts_at ?? ''))
      .sort();
    const lastAt = attended.at(-1) ?? null;
    if (lastAt && ms(lastAt) >= now() - 14 * 86_400_000) continue;
    inactive.push(row('inactive', pass, lastAt ? ms(lastAt) / 1000 : 0, lastAt));
  }
  const rank = (rows: ReturnType<typeof row>[]) =>
    rows
      .sort((x, y) => x.urgency - y.urgency || String(x.member_id).localeCompare(String(y.member_id)))
      .slice(0, limit)
      .map(({ urgency: _urgency, ...rest }) => rest);
  return [...rank(expiring), ...rank(low), ...rank(inactive)];
}

function stats(a: Args): Row[] {
  const unit = a.p_unit;
  const count = Number(a.p_count ?? 7);
  if ((unit !== 'day' && unit !== 'month') || !(count >= 1 && count <= 31)) raise('VALIDATION');
  const date = today();
  const buckets: string[] = [];
  if (unit === 'day') {
    for (let i = count - 1; i >= 0; i -= 1) buckets.push(addDaysToKey(date, -i));
  } else {
    const [y, m] = date.split('-').map(Number) as [number, number];
    for (let i = count - 1; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      buckets.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`);
    }
  }
  const from = buckets[0]!;
  const bucketOf = (local: string) =>
    local < from || local > date ? null : unit === 'day' ? local : `${local.slice(0, 7)}-01`;
  const rows = new Map(
    buckets.map((b) => [b, { bucket: b, bookings: 0, attended: 0, new_members: 0, renewals: 0 }]),
  );
  for (const { b, s } of scheduledBookings()) {
    const bucket = rows.get(bucketOf(localDate(s.starts_at)) ?? '');
    if (!bucket) continue;
    if (SEATED.includes(String(b.status))) bucket.bookings += 1;
    if (b.status === 'attended') bucket.attended += 1;
  }
  for (const m of table('members')) {
    const bucket = !m.deleted_at && rows.get(bucketOf(localDate(m.joined_at)) ?? '');
    if (bucket) bucket.new_members += 1;
  }
  const renewed = new Map<string, Set<unknown>>();
  for (const p of table('member_passes')) {
    const key = !p.deleted_at && isRenewal(p) ? bucketOf(localDate(p.created_at)) : null;
    if (key) renewed.set(key, (renewed.get(key) ?? new Set()).add(p.member_id));
  }
  for (const [key, set] of renewed) rows.get(key)!.renewals = set.size;
  return [...rows.values()];
}

export const dashboardRpcs = {
  today_summary: {
    mutates: [],
    run: (a: Args) => {
      const date = typeof a.p_date === 'string' ? a.p_date : today();
      const monthStart = `${date.slice(0, 7)}-01`;
      const todays = scheduledBookings().filter(({ s }) => localDate(s.starts_at) === date);
      const inMonth = (iso: unknown) => {
        const local = localDate(iso);
        return monthStart <= local && local <= date;
      };
      return {
        date,
        bookings: todays.filter(({ b }) => SEATED.includes(String(b.status))).length,
        attended: todays.filter(({ b }) => b.status === 'attended').length,
        attendance_base: todays.filter(
          ({ b, s }) => SEATED.includes(String(b.status)) && ms(s.starts_at) <= now(),
        ).length,
        new_members: table('members').filter((m) => !m.deleted_at && inMonth(m.joined_at)).length,
        renewals: new Set(
          table('member_passes')
            .filter((p) => !p.deleted_at && inMonth(p.created_at) && isRenewal(p))
            .map((p) => p.member_id),
        ).size,
      };
    },
  },
  today_followups: { mutates: [], run: followups },
  center_stats: { mutates: [], run: stats },
  center_plan_usage: {
    mutates: [],
    run: () => {
      const center = byId('centers', CENTER_ID)!;
      const plan = byId('plans', center.plan_id);
      return {
        status: center.status,
        trial_ends_at: center.trial_ends_at ?? null,
        plan_name: plan?.name ?? null,
        monthly_price: plan?.monthly_price ?? null,
        max_members: plan?.max_members ?? null,
        max_staff: plan?.max_staff ?? null,
        member_count: activeMembers().length,
        staff_count: table('staff').filter((s) => !s.deleted_at).length,
      };
    },
  },
};
