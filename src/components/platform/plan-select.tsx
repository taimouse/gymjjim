'use client';

import { useTranslations } from 'next-intl';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlans } from '@/features/platform/queries';
import { formatWon } from '@/lib/format';

/** 요금제 고르기. 판매 중지된 요금제는 지금 쓰고 있는 것만 보여준다 */
export function PlanSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('platform.plans');
  const plans = usePlans();
  const options = (plans.data ?? []).filter((plan) => plan.is_active || plan.id === value);

  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={plans.isPending}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={t('select')} />
      </SelectTrigger>
      <SelectContent>
        {options.map((plan) => (
          <SelectItem key={plan.id} value={plan.id}>
            {plan.name} · {t('perMonth', { price: formatWon(plan.monthly_price) })}
            {!plan.is_active && ` (${t('inactive')})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
