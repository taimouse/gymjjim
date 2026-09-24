'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { formatDDay } from '@/lib/format';
import { type PassState, passTone } from '@/lib/pass-status';

/**
 * 대표 이용권 상태 뱃지. 예) "잔여 3회 · D-12", "무제한 · D-5", "정지 중 · D-30", "만료"
 */
export function PassStatusBadge({
  state,
  remaining,
  daysLeft,
  className,
}: {
  state: PassState | string | null;
  remaining: number | null;
  daysLeft: number | null;
  className?: string;
}) {
  const t = useTranslations('members.pass');
  const known = (['active', 'on_hold', 'expired', 'exhausted', 'upcoming', 'cancelled'] as const).find(
    (value) => value === state,
  );
  const tone = passTone(known ?? null, daysLeft, remaining);

  if (!known) {
    return (
      <Badge variant="muted" className={className}>
        {t('none')}
      </Badge>
    );
  }

  const parts: string[] = [];
  if (known === 'active' || known === 'on_hold') {
    if (known === 'on_hold') parts.push(t('on_hold'));
    else parts.push(remaining === null ? t('unlimited') : t('remaining', { count: remaining }));
    if (daysLeft !== null) parts.push(formatDDay(daysLeft));
  } else {
    parts.push(t(known));
  }

  return (
    <Badge variant={tone} className={className}>
      {parts.join(' · ')}
    </Badge>
  );
}
