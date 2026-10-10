'use client';

import { CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ValidationMessage } from '@/components/form-messages';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

const DEFAULT_TIME = '09:00';

/**
 * 공개 예약 입력 (프로그램·수업 공용)
 * 값은 센터 시간대 `yyyy-MM-ddTHH:mm`, 빈 문자열이면 바로 공개.
 */
export function PublishAtField({
  id,
  value,
  onChange,
  defaultDate,
  error,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** 켤 때 처음 채울 날짜 (yyyy-MM-dd) */
  defaultDate: string;
  error?: { message?: string };
  disabled?: boolean;
}) {
  const t = useTranslations('publish');
  const enabled = value !== '';
  const [date = defaultDate, time = DEFAULT_TIME] = enabled ? value.split('T') : [];

  return (
    <Field data-invalid={!!error}>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium">
        <span className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          {t('label')}
        </span>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(on) => onChange(on ? `${defaultDate}T${DEFAULT_TIME}` : '')}
        />
      </label>
      <FieldDescription>{t('hint')}</FieldDescription>
      {enabled && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <FieldLabel htmlFor={`${id}-date`}>{t('date')}</FieldLabel>
            <Input
              id={`${id}-date`}
              type="date"
              value={date}
              disabled={disabled}
              onChange={(event) => event.target.value && onChange(`${event.target.value}T${time}`)}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor={`${id}-time`}>{t('time')}</FieldLabel>
            <Input
              id={`${id}-time`}
              type="time"
              step={300}
              value={time}
              disabled={disabled}
              onChange={(event) => event.target.value && onChange(`${date}T${event.target.value}`)}
            />
          </div>
        </div>
      )}
      <ValidationMessage error={error} />
    </Field>
  );
}
