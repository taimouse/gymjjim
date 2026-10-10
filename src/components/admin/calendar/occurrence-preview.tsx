'use client';

import { RotateCcw, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import type { Occurrence } from '@/features/sessions/recurrence';
import { formatDateKey } from '@/lib/format';
import { cn } from '@/lib/utils';

const COLLAPSED = 12;

/** 반복으로 만들어질 날짜 목록. 눌러서 공휴일·휴무일을 빼거나 다시 넣는다 */
export function OccurrencePreview({
  occurrences,
  excluded,
  onToggle,
}: {
  /** 제외 전 전체 날짜 */
  occurrences: Occurrence[];
  excluded: readonly string[];
  onToggle: (date: string) => void;
}) {
  const t = useTranslations('calendar.create');
  const [expanded, setExpanded] = useState(false);
  if (occurrences.length <= 1) return null;
  const excludedSet = new Set(excluded);
  const excludedCount = occurrences.filter((item) => excludedSet.has(item.date)).length;
  const visible = expanded ? occurrences : occurrences.slice(0, COLLAPSED);

  return (
    <section className="space-y-2" aria-label={t('occurrences')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{t('occurrences')}</h3>
        {excludedCount > 0 && (
          <Badge variant="secondary">{t('excludedCount', { count: excludedCount })}</Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t('excludeHint')}</p>
      <ul className="flex flex-wrap gap-2">
        {visible.map((item) => {
          const off = excludedSet.has(item.date);
          const label = formatDateKey(item.date, { weekday: true });
          return (
            <li key={item.date}>
              <button
                type="button"
                onClick={() => onToggle(item.date)}
                aria-pressed={!off}
                aria-label={off ? t('restore', { date: label }) : t('exclude', { date: label })}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm transition',
                  off
                    ? 'border-dashed text-muted-foreground line-through'
                    : 'bg-background hover:border-danger/50 hover:text-danger',
                )}
              >
                {label}
                {off ? (
                  <RotateCcw className="size-3.5" aria-hidden />
                ) : (
                  <X className="size-3.5" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {occurrences.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {expanded ? t('showLess') : t('showAll', { count: occurrences.length })}
        </button>
      )}
    </section>
  );
}
