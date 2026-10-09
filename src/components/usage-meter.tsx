import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * 요금제 한도 대비 사용량 (예: 회원 87 / 300명). 한도가 없으면 막대 없이 숫자만.
 * 90% 이상이면 주의, 한도에 닿으면 위험 색으로 바뀐다.
 */
export function UsageMeter({
  label,
  count,
  limit,
  unit,
  unlimitedLabel,
}: {
  label: string;
  count: number;
  limit: number | null;
  unit: string;
  unlimitedLabel: string;
}) {
  const ratio = limit ? Math.min(count / limit, 1) : 0;
  const tone = limit === null ? 'normal' : count >= limit ? 'danger' : ratio >= 0.9 ? 'warning' : 'normal';

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span
          className={cn('numeric', tone === 'danger' && 'text-danger', tone === 'warning' && 'text-warning')}
        >
          <span className="text-2xl font-bold">{formatNumber(count)}</span>
          <span className="ml-1 text-muted-foreground">
            / {limit === null ? unlimitedLabel : `${formatNumber(limit)}${unit}`}
          </span>
        </span>
      </div>
      {limit !== null && (
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={count}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full bg-primary transition-[width]',
              tone === 'warning' && 'bg-warning',
              tone === 'danger' && 'bg-danger',
            )}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
