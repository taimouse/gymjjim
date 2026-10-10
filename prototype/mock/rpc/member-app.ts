/** 회원 앱 조회 RPC (member_schedule · member_bookings · repeat_last_week_candidates) */
import { byId, CENTER_ID, raise, type Row, table } from '../db';
import {
  ACTIVE_BOOKING,
  addDaysToKey,
  closeAt,
  isPublished,
  localDate,
  me,
  ms,
  now,
  rules,
  today,
} from './helpers';

type Args = Record<string, unknown>;

const instructorName = (session: Row) =>
  (byId('staff', session.instructor_id)?.name as string | undefined) ?? null;

export const memberAppRpcs = {
  member_schedule: {
    mutates: [],
    run: (a: Args) => {
      const from = String(a.p_from);
      const to = String(a.p_to);
      if (Date.parse(to) - Date.parse(from) > 31 * 86_400_000) raise('VALIDATION');
      const memberId = me().id;
      return table('sessions')
        .filter(
          (s) => s.center_id === CENTER_ID && !s.deleted_at && s.status === 'scheduled' && isPublished(s),
        )
        .filter((s) => {
          const date = localDate(s.starts_at);
          return from <= date && date <= to;
        })
        .map((s) => {
          const program = byId('programs', s.program_id);
          const booking = table('bookings').find(
            (b) =>
              b.session_id === s.id && b.member_id === memberId && ACTIVE_BOOKING.includes(String(b.status)),
          );
          return {
            session_id: s.id,
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            program_id: s.program_id,
            program_name: program?.name ?? '',
            program_color: program?.color ?? '#E5E7EB',
            instructor_name: instructorName(s),
            capacity: s.capacity,
            booked_count: s.booked_count,
            waitlist_count: s.waitlist_count,
            my_booking_id: booking?.id ?? null,
            my_status: booking?.status ?? null,
            my_waitlist_position: booking?.waitlist_position ?? null,
            my_pass_type: booking ? (byId('member_passes', booking.member_pass_id)?.type ?? null) : null,
            my_credits_used: booking ? Number(booking.credits_used ?? 0) : null,
            credit_cost: program?.credit_cost ?? null,
          };
        })
        .sort(
          (x, y) =>
            String(x.starts_at).localeCompare(String(y.starts_at)) ||
            String(x.program_name).localeCompare(String(y.program_name)),
        );
    },
  },
  member_bookings: {
    mutates: [],
    run: (a: Args) => {
      const memberId = me().id;
      const limit = Math.min(Math.max(Number(a.p_limit ?? 50), 1), 200);
      const rows = table('bookings')
        .filter((b) => b.member_id === memberId)
        .map((b) => ({ b, s: byId('sessions', b.session_id) }))
        .filter((x): x is { b: Row; s: Row } => !!x.s)
        .filter(({ b, s }) => {
          const upcoming = ['booked', 'waitlisted'].includes(String(b.status)) && ms(s.ends_at) > now();
          return upcoming === !!a.p_upcoming;
        })
        .sort((x, y) =>
          a.p_upcoming
            ? String(x.s.starts_at).localeCompare(String(y.s.starts_at))
            : String(y.s.starts_at).localeCompare(String(x.s.starts_at)),
        )
        .slice(0, limit);
      return rows.map(({ b, s }) => {
        const program = byId('programs', s.program_id);
        const pass = byId('member_passes', b.member_pass_id);
        return {
          booking_id: b.id,
          status: b.status,
          waitlist_position: b.waitlist_position,
          session_id: s.id,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          session_status: s.status,
          cancel_reason: s.cancel_reason,
          program_name: program?.name ?? '',
          program_color: program?.color ?? '#E5E7EB',
          instructor_name: instructorName(s),
          pass_name: pass?.name ?? null,
          pass_type: pass?.type ?? null,
          credits_used: Number(b.credits_used ?? 0),
        };
      });
    },
  },
  repeat_last_week_candidates: {
    mutates: [],
    run: () => {
      const memberId = me().id;
      const first = today();
      const last = addDaysToKey(first, rules().open_days_before);
      const mine = table('bookings').filter((b) => b.member_id === memberId);
      const found = new Map<string, Row>();
      for (const booking of mine) {
        if (!['booked', 'attended', 'no_show'].includes(String(booking.status))) continue;
        const past = byId('sessions', booking.session_id);
        if (!past) continue;
        const target = ms(past.starts_at) + 7 * 86_400_000;
        for (const s of table('sessions')) {
          if (s.program_id !== past.program_id || s.status !== 'scheduled' || s.deleted_at) continue;
          if (ms(s.starts_at) !== target || !isPublished(s)) continue;
          const date = localDate(s.starts_at);
          if (date < first || date > last) continue;
          if (mine.some((b) => b.session_id === s.id && ACTIVE_BOOKING.includes(String(b.status)))) continue;
          const program = byId('programs', s.program_id);
          found.set(String(s.id), {
            session_id: s.id,
            starts_at: s.starts_at,
            ends_at: s.ends_at,
            program_name: program?.name ?? '',
            program_color: program?.color ?? '#E5E7EB',
            instructor_name: instructorName(s),
            capacity: s.capacity,
            booked_count: s.booked_count,
            waitlist_count: s.waitlist_count,
            bookable: now() < closeAt(s),
          });
        }
      }
      return [...found.values()];
    },
  },
};
