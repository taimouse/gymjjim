import { Dumbbell } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export function BrandMark({
  className,
  labelClassName,
  compact = false,
}: {
  className?: string;
  labelClassName?: string;
  compact?: boolean;
}) {
  const t = useTranslations('app');
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Dumbbell className="size-5" aria-hidden />
      </span>
      {!compact && <span className={cn('text-xl', labelClassName)}>{t('name')}</span>}
    </span>
  );
}
