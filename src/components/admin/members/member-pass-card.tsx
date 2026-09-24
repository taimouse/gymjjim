'use client';

import { PauseCircle, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import type { MemberPassRow } from '@/features/members/queries';
import { formatDateKey, formatDDay } from '@/lib/format';
import { computePassState, passDaysLeft, passTone } from '@/lib/pass-status';
import { cn } from '@/lib/utils';

import { PassStatusBadge } from './pass-status-badge';

const TONE_BG = {
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  info: 'bg-info-soft text-info-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
  brand: 'bg-brand-soft text-brand-soft-foreground',
  muted: 'bg-muted text-muted-foreground',
} as const;

/** 대표 이용권 카드: 잔여 횟수·만료 D-day 를 크게, 정지 버튼 */
export function MemberPassCard({
  pass,
  today,
  onHold,
  onGrant,
}: {
  pass: MemberPassRow | null;
  today: string;
  onHold: (pass: MemberPassRow) => void;
  onGrant: () => void;
}) {
  const t = useTranslations('members');

  if (!pass) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-5">
        <p className="text-muted-foreground">{t('drawer.noPass')}</p>
        <Button onClick={onGrant}>
          <Plus aria-hidden />
          {t('drawer.grantPass')}
        </Button>
      </div>
    );
  }

  const state = computePassState({ ...pass, holds: pass.holds }, today);
  const daysLeft = passDaysLeft(pass, today);
  const tone = passTone(state, daysLeft, pass.remaining_count);
  const canHold = state === 'active' || state === 'upcoming';

  return (
    <div className={cn('space-y-4 rounded-2xl p-5', TONE_BG[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{pass.name}</p>
          <p className="text-sm opacity-80">
            {pass.end_date
              ? t('pass.period', {
                  start: formatDateKey(pass.start_date),
                  end: formatDateKey(pass.end_date, { year: true }),
                })
              : t('pass.startsOn', { date: formatDateKey(pass.start_date, { year: true }) })}
          </p>
        </div>
        <PassStatusBadge
          state={state}
          remaining={pass.remaining_count}
          daysLeft={daysLeft}
          className="bg-background/70"
        />
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-background/70 p-3">
          <dt className="text-sm opacity-80">{t('drawer.remainingLabel')}</dt>
          <dd className="text-3xl font-extrabold numeric">
            {pass.remaining_count === null ? (
              t('pass.unlimited')
            ) : (
              <>
                {pass.remaining_count}
                <span className="ml-0.5 text-lg font-bold">{t('drawer.timesUnit')}</span>
              </>
            )}
          </dd>
        </div>
        <div className="rounded-xl bg-background/70 p-3">
          <dt className="text-sm opacity-80">{t('drawer.ddayLabel')}</dt>
          <dd className="text-3xl font-extrabold numeric">
            {daysLeft === null ? t('pass.noExpiry') : formatDDay(daysLeft)}
          </dd>
        </div>
      </dl>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 bg-background/80"
          onClick={() => onHold(pass)}
          disabled={!canHold}
        >
          <PauseCircle aria-hidden />
          {t('drawer.hold')}
        </Button>
        <Button variant="outline" className="flex-1 bg-background/80" onClick={onGrant}>
          <Plus aria-hidden />
          {t('drawer.grantPass')}
        </Button>
      </div>
    </div>
  );
}
