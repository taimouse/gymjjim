/** 관리자 RPC (update_session · set_session_publish_at · save_program) */
import { byId, CENTER_ID, raise, type Row, table } from '../db';
import { promoteWaitlist } from './engine';
import { enqueue, insert, isOwner, ms, requireSession, rules, sessionPayload, update } from './helpers';

type Args = Record<string, unknown>;

function updateSession(a: Args) {
  if (!['this', 'following'].includes(String(a.p_scope ?? 'this'))) raise('VALIDATION');
  const base = requireSession(a.p_session_id);
  if (base.status === 'cancelled') raise('SESSION_CANCELLED');
  const starts = a.p_starts_at as string | undefined;
  const ends = a.p_ends_at as string | undefined;
  if (!!starts !== !!ends || (starts && ends && ms(ends) <= ms(starts))) raise('INVALID_DATE_RANGE');
  const capacity = a.p_capacity as number | undefined;
  if (capacity !== undefined && (capacity < 1 || capacity > 500)) raise('VALIDATION');
  const timeChanged = !!starts && (ms(starts) !== ms(base.starts_at) || ms(ends) !== ms(base.ends_at));
  const delta = starts ? ms(starts) - ms(base.starts_at) : 0;
  const duration = starts && ends ? ms(ends) - ms(starts) : 0;
  const targets = table('sessions')
    .filter(
      (s) =>
        s.status === 'scheduled' &&
        !s.deleted_at &&
        (s.id === base.id ||
          (a.p_scope === 'following' &&
            !!base.recurrence_group_id &&
            s.recurrence_group_id === base.recurrence_group_id &&
            ms(s.starts_at) > ms(base.starts_at))),
    )
    .sort((x, y) => String(x.starts_at).localeCompare(String(y.starts_at)));
  let notified = 0;
  for (const target of targets) {
    const previous = { previous_starts_at: target.starts_at, previous_ends_at: target.ends_at };
    const oldCapacity = Number(target.capacity);
    const values: Row = {};
    if (timeChanged) {
      const start = ms(target.starts_at) + delta;
      values.starts_at = new Date(start).toISOString();
      values.ends_at = new Date(start + duration).toISOString();
    }
    if (a.p_clear_instructor) values.instructor_id = null;
    else if (a.p_instructor_id) values.instructor_id = a.p_instructor_id;
    if (capacity !== undefined) values.capacity = capacity;
    if (typeof a.p_note === 'string') values.note = a.p_note.trim() || null;
    update(target, values);
    if (capacity !== undefined && capacity > oldCapacity && rules().auto_promote_waitlist)
      promoteWaitlist(target.id);
    if (timeChanged && a.p_notify) {
      for (const booking of table('bookings')) {
        if (booking.session_id !== target.id || !['booked', 'waitlisted'].includes(String(booking.status)))
          continue;
        enqueue(
          booking.member_id,
          'session_changed',
          { ...sessionPayload(target), ...previous, booking_id: booking.id },
          `session_changed:${String(booking.id)}:${Math.floor(ms(target.starts_at) / 1000)}`,
          true,
        );
        notified += 1;
      }
    }
  }
  return { updated: targets.length, notified };
}

export const adminRpcs = {
  update_session: {
    mutates: ['sessions', 'bookings', 'member_passes', 'notification_logs'],
    run: updateSession,
  },
  set_session_publish_at: {
    mutates: ['sessions'],
    run: (a: Args) => {
      if (!['this', 'following'].includes(String(a.p_scope))) raise('VALIDATION');
      const base = requireSession(a.p_session_id);
      const targets = table('sessions').filter(
        (s) =>
          !s.deleted_at &&
          (s.id === base.id ||
            (a.p_scope === 'following' &&
              !!base.recurrence_group_id &&
              s.recurrence_group_id === base.recurrence_group_id &&
              ms(s.starts_at) >= ms(base.starts_at))),
      );
      for (const s of targets) update(s, { publish_at: a.p_publish_at ?? null });
      return targets.length;
    },
  },
  save_program: {
    mutates: ['programs', 'program_allowed_products'],
    run: (a: Args) => {
      // 실제 앱에서는 RLS(대표만 쓰기)가 막는다
      if (!isOwner()) raise('FORBIDDEN');
      const values = {
        name: a.p_name,
        type: a.p_type,
        default_capacity: a.p_default_capacity,
        duration_min: a.p_duration_min,
        color: a.p_color,
        default_instructor_id: a.p_default_instructor_id ?? null,
        description:
          typeof a.p_description === 'string' && a.p_description.trim() ? a.p_description.trim() : null,
        publish_at: a.p_publish_at ?? null,
      };
      let program: Row | undefined;
      if (!a.p_id) {
        const orders = table('programs').map((p) => Number(p.sort_order));
        program = insert('programs', {
          center_id: CENTER_ID,
          ...values,
          sort_order: orders.length ? Math.max(...orders) + 1 : 0,
        });
      } else {
        program = byId('programs', a.p_id);
        if (!program || program.deleted_at) raise('FORBIDDEN');
        update(program, values);
      }
      const wanted = new Set((a.p_allowed_product_ids as string[] | undefined) ?? []);
      const links = table('program_allowed_products');
      for (let i = links.length - 1; i >= 0; i -= 1) {
        if (links[i]!.program_id === program.id && !wanted.has(String(links[i]!.product_id)))
          links.splice(i, 1);
      }
      for (const productId of wanted) {
        if (!links.some((l) => l.program_id === program.id && l.product_id === productId))
          links.push({
            center_id: CENTER_ID,
            program_id: program.id,
            product_id: productId,
            created_at: new Date().toISOString(),
          });
      }
      return program.id;
    },
  },
};
