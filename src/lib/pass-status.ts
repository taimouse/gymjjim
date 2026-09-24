import { daysUntil } from './format';

/** 이용권 상태 (DB private.pass_state 와 같은 규칙) */
export type PassState = 'active' | 'on_hold' | 'expired' | 'exhausted' | 'upcoming' | 'cancelled';

export interface PassLike {
  status: 'active' | 'cancelled';
  start_date: string;
  end_date: string | null;
  remaining_count: number | null;
  deleted_at?: string | null;
  holds?: { start_date: string; end_date: string }[];
}

/** today: 센터 시간대 기준 'yyyy-MM-dd' */
export function computePassState(pass: PassLike, today: string): PassState {
  if (pass.status !== 'active' || pass.deleted_at) return 'cancelled';
  if (pass.start_date > today) return 'upcoming';
  if (pass.end_date !== null && pass.end_date < today) return 'expired';
  if (pass.remaining_count !== null && pass.remaining_count <= 0) return 'exhausted';
  if ((pass.holds ?? []).some((hold) => hold.start_date <= today && today <= hold.end_date)) return 'on_hold';
  return 'active';
}

export function passDaysLeft(pass: Pick<PassLike, 'end_date'>, today: string): number | null {
  return pass.end_date === null ? null : daysUntil(pass.end_date, today);
}

export type Tone = 'success' | 'warning' | 'info' | 'danger' | 'muted' | 'brand';

/** 상태 색: 만료 7일 이내·잔여 2회 이하면 주의(warning) */
export function passTone(state: PassState | null, daysLeft: number | null, remaining: number | null): Tone {
  switch (state) {
    case 'active':
      return (daysLeft !== null && daysLeft <= 7) || (remaining !== null && remaining <= 2)
        ? 'warning'
        : 'success';
    case 'on_hold':
      return 'info';
    case 'upcoming':
      return 'brand';
    case 'expired':
    case 'exhausted':
      return 'danger';
    default:
      return 'muted';
  }
}

/** 대표 이용권 고르기: 쓸 수 있는 것 중 만료 임박 순, 없으면 가장 최근에 끝난 것 */
export function pickPrimaryPass<T extends PassLike & { created_at?: string }>(
  passes: T[],
  today: string,
): T | null {
  const usable = (pass: T) => ['active', 'on_hold', 'upcoming'].includes(computePassState(pass, today));
  const sorted = [...passes]
    .filter((pass) => pass.status === 'active' && !pass.deleted_at)
    .sort((a, b) => {
      const ua = usable(a) ? 0 : 1;
      const ub = usable(b) ? 0 : 1;
      if (ua !== ub) return ua - ub;
      const ea = a.end_date ?? '9999-12-31';
      const eb = b.end_date ?? '9999-12-31';
      return ua === 0 ? ea.localeCompare(eb) : eb.localeCompare(ea);
    });
  return sorted[0] ?? null;
}
