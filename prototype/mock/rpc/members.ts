/** 회원·이용권 RPC (search_members · grant_member_pass · create_hold · withdraw_member · 초대 · 가져오기) */
import { byId, CENTER_ID, nowIso, raise, type Row, table, uuid } from '../db';
import { cancelBooking } from './engine';
import { searchMembers } from './search';
import {
  ACTIVE_BOOKING,
  addDaysToKey,
  daysBetween,
  enqueue,
  insert,
  isOwner,
  localDate,
  me,
  ms,
  now,
  staffId,
  update,
} from './helpers';

type Args = Record<string, unknown>;

function maskName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const chars = [...name];
  if (chars.length <= 1) return '*';
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${'*'.repeat(chars.length - 2)}${chars.at(-1)}`;
}

export const memberRpcs = {
  search_members: { mutates: [], run: searchMembers },
  grant_member_pass: {
    mutates: ['member_passes'],
    run: (a: Args) => {
      const member = byId('members', a.p_member_id);
      if (!member || member.status !== 'active' || member.deleted_at) raise('MEMBER_NOT_FOUND');
      const product = byId('pass_products', a.p_product_id);
      if (!product || product.deleted_at || !product.is_active) raise('PRODUCT_NOT_FOUND');
      if (!a.p_start_date || typeof a.p_paid_amount !== 'number' || a.p_paid_amount < 0) raise('VALIDATION');
      const start = String(a.p_start_date);
      const end = product.duration_days ? addDaysToKey(start, Number(product.duration_days) - 1) : null;
      const pass = insert('member_passes', {
        center_id: CENTER_ID,
        member_id: member.id,
        product_id: product.id,
        name: product.name,
        type: product.type,
        start_date: start,
        end_date: end,
        total_count: product.total_count,
        remaining_count: product.total_count,
        period_limit_count: product.period_limit_count,
        period_limit_unit: product.period_limit_unit,
        paid_amount: a.p_paid_amount,
        paid_at: a.p_paid_at ?? nowIso(),
        memo: typeof a.p_memo === 'string' && a.p_memo.trim() ? a.p_memo.trim() : null,
        created_by: staffId(),
      });
      return { member_pass_id: pass.id, start_date: start, end_date: end, total_count: product.total_count };
    },
  },
  create_hold: {
    mutates: ['pass_holds', 'member_passes'],
    run: (a: Args) => {
      const pass = byId('member_passes', a.p_member_pass_id);
      if (!pass || pass.deleted_at || pass.status !== 'active') raise('PASS_NOT_FOUND');
      const start = String(a.p_start_date ?? '');
      const end = String(a.p_end_date ?? '');
      if (!start || !end || end < start || daysBetween(start, end) + 1 > 365) raise('INVALID_DATE_RANGE');
      if (start < String(pass.start_date) || (pass.end_date && start > String(pass.end_date)))
        raise('HOLD_OUT_OF_RANGE');
      const overlaps = table('pass_holds').some(
        (h) => h.member_pass_id === pass.id && String(h.start_date) <= end && start <= String(h.end_date),
      );
      if (overlaps) raise('HOLD_OVERLAP');
      const booked = table('bookings').some((b) => {
        if (b.member_pass_id !== pass.id || !ACTIVE_BOOKING.includes(String(b.status))) return false;
        const date = localDate(byId('sessions', b.session_id)?.starts_at);
        return start <= date && date <= end;
      });
      if (booked) raise('HOLD_HAS_BOOKINGS');
      const days = daysBetween(start, end) + 1;
      const hold = insert('pass_holds', {
        center_id: CENTER_ID,
        member_pass_id: pass.id,
        start_date: start,
        end_date: end,
        reason: typeof a.p_reason === 'string' && a.p_reason.trim() ? a.p_reason.trim() : null,
        created_by: staffId(),
      });
      const previous = pass.end_date ?? null;
      if (pass.end_date) update(pass, { end_date: addDaysToKey(String(pass.end_date), days) });
      return { hold_id: hold.id, days, previous_end_date: previous, new_end_date: pass.end_date ?? null };
    },
  },
  withdraw_member: {
    mutates: ['members', 'bookings', 'sessions', 'member_passes', 'member_invites', 'notification_logs'],
    run: (a: Args) => {
      const member = byId('members', a.p_member_id);
      if (!member || member.deleted_at) raise('MEMBER_NOT_FOUND');
      if (!isOwner()) raise('FORBIDDEN');
      let cancelled = 0;
      for (const booking of [...table('bookings')]) {
        const session = byId('sessions', booking.session_id);
        if (booking.member_id !== member.id || !['booked', 'waitlisted'].includes(String(booking.status)))
          continue;
        if (!session || ms(session.starts_at) <= now()) continue;
        cancelBooking(booking.id, true, true);
        cancelled += 1;
      }
      for (const invite of table('member_invites')) {
        if (invite.member_id === member.id && !invite.used_at && !invite.revoked_at)
          update(invite, { revoked_at: nowIso() });
      }
      update(member, {
        name: maskName(member.name),
        phone: null,
        birth: null,
        gender: null,
        memo: null,
        user_id: null,
        marketing_agreed_at: null,
        tags: [],
        notify_enabled: false,
        status: 'withdrawn',
        withdrawn_at: nowIso(),
        deleted_at: nowIso(),
      });
      return { member_id: member.id, cancelled_bookings: cancelled };
    },
  },
  create_member_invite: {
    mutates: ['member_invites', 'notification_logs'],
    run: (a: Args) => {
      const member = byId('members', a.p_member_id);
      if (!member || member.status !== 'active' || member.deleted_at) raise('MEMBER_NOT_FOUND');
      if (member.user_id) raise('MEMBER_ALREADY_LINKED');
      for (const invite of table('member_invites')) {
        if (invite.member_id === member.id && !invite.used_at && !invite.revoked_at)
          update(invite, { revoked_at: nowIso() });
      }
      const token = `${uuid()}${uuid()}`.replace(/-/g, '');
      const expiresAt = new Date(now() + 7 * 86_400_000).toISOString();
      insert('member_invites', {
        center_id: CENTER_ID,
        member_id: member.id,
        token_hash: token,
        expires_at: expiresAt,
        created_by: staffId(),
      });
      if (typeof a.p_invite_url_base === 'string') {
        enqueue(
          member.id,
          'member_invite',
          {
            invite_url: `${a.p_invite_url_base}${token}`,
            center_name: byId('centers', CENTER_ID)?.name,
            member_name: member.name,
            expires_at: expiresAt,
          },
          null,
          true,
        );
      }
      return { token, expires_at: expiresAt };
    },
  },
  import_members: {
    mutates: ['members'],
    run: (a: Args) => {
      if (!Array.isArray(a.p_rows) || a.p_rows.length > 2000) raise('VALIDATION');
      const skipped: string[] = [];
      let inserted = 0;
      for (const raw of a.p_rows as Row[]) {
        const phone = String(raw.phone ?? '');
        if (table('members').some((m) => m.center_id === CENTER_ID && m.phone === phone && !m.deleted_at)) {
          skipped.push(phone);
          continue;
        }
        const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
        insert('members', {
          center_id: CENTER_ID,
          name: raw.name,
          phone,
          birth: text(raw.birth),
          gender: text(raw.gender),
          memo: text(raw.memo),
          tags: Array.isArray(raw.tags) ? raw.tags : [],
          joined_at: text(raw.joined_at) ?? nowIso(),
          privacy_agreed_at: nowIso(),
        });
        inserted += 1;
      }
      return { inserted, skipped };
    },
  },
  update_my_settings: {
    mutates: ['members'],
    run: (a: Args) => {
      const member = me();
      update(member, {
        notify_enabled: !!a.p_notify_enabled,
        marketing_agreed_at: a.p_marketing_agreed ? (member.marketing_agreed_at ?? nowIso()) : null,
      });
      return null;
    },
  },
  complete_onboarding: {
    mutates: ['members'],
    run: (a: Args) => {
      const member = me();
      if (member.onboarded_at) return { updated: 0 };
      update(member, {
        privacy_agreed_at: nowIso(),
        marketing_agreed_at: a.p_marketing_agreed ? nowIso() : null,
        onboarded_at: nowIso(),
      });
      return { updated: 1 };
    },
  },
};
