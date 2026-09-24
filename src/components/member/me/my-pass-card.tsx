import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { formatDateKey, formatDDay } from '@/lib/format';
import { computePassState, passDaysLeft, type PassLike, passTone } from '@/lib/pass-status';
import { cn } from '@/lib/utils';

export interface MyPass extends PassLike {
  id: string;
  name: string;
  total_count: number | null;
  period_limit_count: number | null;
  period_limit_unit: 'week' | 'month' | null;
  holds: { start_date: string; end_date: string }[];
}

/** 내 이용권 카드: 잔여 횟수 · 만료 D-day 를 크게, 기간 · 이용 제한 · 정지 상태 */
export function MyPassCard({ pass, today }: { pass: MyPass; today: string }) {
  const t = useTranslations('member.me');
  const tPass = useTranslations('members.pass');
  const tUnit = useTranslations('products.unit');
  const state = computePassState(pass, today);
  const daysLeft = passDaysLeft(pass, today);
  const tone = passTone(state, daysLeft, pass.remaining_count);
  const ended = state === 'expired' || state === 'exhausted' || state === 'cancelled';
  const hold = [...pass.holds]
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .find((item) => item.end_date >= today);
  const holdParams = hold && { start: formatDateKey(hold.start_date), end: formatDateKey(hold.end_date) };

  return (
    <article className={cn('rounded-2xl border bg-card p-5 shadow-xs', ended && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-lg font-bold break-keep">{pass.name}</h3>
        <Badge variant={tone} className="h-7 px-3">
          {tPass(state)}
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="text-sm text-muted-foreground">{t('remaining')}</dt>
          <dd className="mt-1 text-3xl font-bold numeric">
            {pass.remaining_count === null ? (
              <span className="text-2xl">{t('unlimited')}</span>
            ) : (
              <>
                {pass.remaining_count}
                <span className="ml-0.5 text-base font-semibold">{t('timesUnit')}</span>
              </>
            )}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <dt className="text-sm text-muted-foreground">{t('dday')}</dt>
          <dd
            className={cn(
              'mt-1 text-3xl font-bold numeric',
              daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && 'text-warning',
            )}
          >
            {daysLeft === null ? <span className="text-2xl">{t('noExpiry')}</span> : formatDDay(daysLeft)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 space-y-1 text-muted-foreground">
        <p>
          {t('period', {
            start: formatDateKey(pass.start_date, { year: true }),
            end: pass.end_date ? formatDateKey(pass.end_date, { year: true }) : t('noExpiry'),
          })}
        </p>
        {pass.period_limit_count !== null && pass.period_limit_unit !== null && (
          <p>{t('limit', { unit: tUnit(pass.period_limit_unit), count: pass.period_limit_count })}</p>
        )}
      </div>

      {hold && holdParams && (
        <p className="mt-3 rounded-xl bg-info-soft p-3 font-semibold text-info-soft-foreground">
          {hold.start_date <= today ? t('onHold', holdParams) : t('holdScheduled', holdParams)}
        </p>
      )}
    </article>
  );
}
