/** search_members: 회원 목록 검색·필터·정렬 (대표 이용권 포함) */
import { CENTER_ID, type Row, table } from '../db';
import { daysBetween, passState, today } from './helpers';

type Args = Record<string, unknown>;

const USABLE = ['active', 'on_hold', 'upcoming'];

/** 회원 목록에 보여줄 대표 이용권 (쓸 수 있는 것 중 만료 임박 → 최근 끝난 것) */
function representativePass(memberId: unknown, date: string): Row | null {
  const passes = table('member_passes').filter(
    (p) => p.member_id === memberId && p.status === 'active' && !p.deleted_at,
  );
  const end = (p: Row) => String(p.end_date ?? '9999-12-31');
  return (
    [...passes].sort((a, b) => {
      const ua = USABLE.includes(passState(a, date)) ? 0 : 1;
      const ub = USABLE.includes(passState(b, date)) ? 0 : 1;
      if (ua !== ub) return ua - ub;
      if (ua === 0) return end(a).localeCompare(end(b));
      return end(b).localeCompare(end(a)) || String(b.created_at).localeCompare(String(a.created_at));
    })[0] ?? null
  );
}

export function searchMembers(a: Args): Row[] {
  const date = today();
  const q = typeof a.p_query === 'string' && a.p_query.trim() ? a.p_query.trim() : null;
  const digits = (typeof a.p_query === 'string' ? a.p_query : '').replace(/\D/g, '');
  const numeric = q !== null && /^[0-9 -]+$/.test(q);
  const rows = table('members')
    .filter((m) => m.center_id === CENTER_ID && !m.deleted_at && m.status === 'active')
    .filter((m) => {
      if (q === null) return true;
      const phone = String(m.phone ?? '');
      if (numeric && digits.length === 4) return phone.endsWith(digits);
      if (numeric) return digits.length >= 5 && phone.includes(digits);
      return String(m.name).toLowerCase().includes(q.toLowerCase());
    })
    .map((m) => {
      const pass = representativePass(m.id, date);
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        tags: m.tags ?? [],
        joined_at: m.joined_at,
        linked: !!m.user_id,
        pass_id: pass?.id ?? null,
        pass_name: pass?.name ?? null,
        pass_type: pass?.type ?? null,
        pass_state: pass ? passState(pass, date) : null,
        pass_end_date: pass?.end_date ?? null,
        pass_remaining: pass?.remaining_count ?? null,
        pass_days_left: pass?.end_date ? daysBetween(date, String(pass.end_date)) : null,
      } as Row;
    })
    .filter((row) => {
      const state = row.pass_state;
      const days = row.pass_days_left as number | null;
      const remaining = row.pass_remaining as number | null;
      switch (a.p_filter) {
        case 'active':
          return state === 'active';
        case 'expiring':
          return state === 'active' && days !== null && days >= 0 && days <= 7;
        case 'low':
          return state === 'active' && remaining !== null && remaining >= 1 && remaining <= 2;
        case 'expired':
          return state === 'expired' || state === 'exhausted';
        case 'hold':
          return state === 'on_hold';
        case 'none':
          return row.pass_id === null;
        default:
          return true;
      }
    });
  const byName = (x: Row, y: Row) =>
    String(x.name).localeCompare(String(y.name), 'ko') || String(x.id).localeCompare(String(y.id));
  rows.sort((x, y) => {
    if (a.p_sort === 'recent') return String(y.joined_at).localeCompare(String(x.joined_at)) || byName(x, y);
    if (a.p_sort === 'expiry')
      return (
        String(x.pass_end_date ?? '9999').localeCompare(String(y.pass_end_date ?? '9999')) || byName(x, y)
      );
    return byName(x, y);
  });
  const limit = Math.min(Math.max(Number(a.p_limit ?? 20), 1), 100);
  const offset = Math.max(Number(a.p_offset ?? 0), 0);
  return rows.slice(offset, offset + limit).map((row) => ({ ...row, total_count: rows.length }));
}
