'use client';

import { getISODay, parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { ValidationMessage } from '@/components/form-messages';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MONTH_WEEKS } from '@/features/sessions/recurrence';
import type { SessionCreateValues } from '@/features/sessions/schema';
import { numberInput } from '@/lib/form';

const WEEKDAYS = ['1', '2', '3', '4', '5', '6', '7'] as const;
const INTERVALS = ['1', '2', '3', '4'] as const;

/**
 * 수업 반복 규칙 입력
 * - 매주: N주마다 + 요일
 * - 매월: 같은 날짜 또는 n번째(첫째~넷째·마지막) 요일, N개월마다
 * - 끝: 종료일 또는 횟수
 */
export function RecurrenceFields({ form }: { form: UseFormReturn<SessionCreateValues> }) {
  const t = useTranslations('calendar.create');
  const tCalendar = useTranslations('calendar');
  const { errors } = form.formState;
  const values = form.watch();
  const firstDay = /^\d{4}-\d{2}-\d{2}$/.test(values.date) ? parseISO(values.date) : null;
  const showWeekdays = values.frequency === 'weekly' || values.monthlyMode === 'weekday';

  const onRepeat = (on: boolean) => {
    form.setValue('repeat', on, { shouldValidate: form.formState.isSubmitted });
    // 처음 켜면 첫 수업 요일을 미리 골라 둔다
    if (on && values.weekdays.length === 0 && firstDay) form.setValue('weekdays', [getISODay(firstDay)]);
  };

  return (
    <>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium">
        {t('repeat')}
        <Switch checked={values.repeat} onCheckedChange={onRepeat} />
      </label>
      {values.repeat && (
        <div className="min-w-0 space-y-5 rounded-xl border bg-muted/30 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t('frequency')}</FieldLabel>
              <Controller
                control={form.control}
                name="frequency"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(value) => value && field.onChange(value)}
                    className="w-full"
                  >
                    {(['weekly', 'monthly'] as const).map((frequency) => (
                      <ToggleGroupItem key={frequency} value={frequency} className="h-11 min-w-0 flex-1 px-0">
                        {t(`frequencies.${frequency}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="create-interval">{t('interval')}</FieldLabel>
              <Controller
                control={form.control}
                name="interval"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <SelectTrigger id="create-interval" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVALS.map((interval) => (
                        <SelectItem key={interval} value={interval}>
                          {values.frequency === 'weekly'
                            ? t('intervalWeekly', { count: Number(interval) })
                            : t('intervalMonthly', { count: Number(interval) })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          {values.frequency === 'monthly' && (
            <Field>
              <FieldLabel>{t('monthlyMode')}</FieldLabel>
              <Controller
                control={form.control}
                name="monthlyMode"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(value) => value && field.onChange(value)}
                    className="w-full"
                  >
                    <ToggleGroupItem value="date" className="h-11 min-w-0 flex-1 px-0">
                      {t('monthlyDate', { day: firstDay?.getDate() ?? 1 })}
                    </ToggleGroupItem>
                    <ToggleGroupItem value="weekday" className="h-11 min-w-0 flex-1 px-0">
                      {t('monthlyWeekday')}
                    </ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
            </Field>
          )}

          {values.frequency === 'monthly' && values.monthlyMode === 'weekday' && (
            <Field data-invalid={!!errors.monthWeeks}>
              <FieldLabel>{t('monthWeeks')}</FieldLabel>
              <Controller
                control={form.control}
                name="monthWeeks"
                render={({ field }) => (
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    value={field.value.map(String)}
                    onValueChange={(value) => field.onChange(value.map(Number).sort())}
                    className="w-full"
                  >
                    {MONTH_WEEKS.map((week) => (
                      <ToggleGroupItem key={week} value={String(week)} className="h-11 min-w-0 flex-1 px-0">
                        {t(`monthWeek.${week}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
              <ValidationMessage error={errors.monthWeeks} />
            </Field>
          )}

          {showWeekdays && (
            <Field data-invalid={!!errors.weekdays}>
              <FieldLabel>{t('weekdays')}</FieldLabel>
              <Controller
                control={form.control}
                name="weekdays"
                render={({ field }) => (
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    value={field.value.map(String)}
                    onValueChange={(value) => field.onChange(value.map(Number).sort())}
                    className="w-full"
                  >
                    {WEEKDAYS.map((day) => (
                      <ToggleGroupItem
                        key={day}
                        value={day}
                        className="h-11 min-w-0 flex-1 px-0"
                        aria-label={tCalendar(`weekdayShort.${day}`)}
                      >
                        {tCalendar(`weekdayShort.${day}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
              <ValidationMessage error={errors.weekdays} />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>{t('endMode')}</FieldLabel>
              <Controller
                control={form.control}
                name="endMode"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(value) => value && field.onChange(value)}
                    className="w-full"
                  >
                    {(['until', 'count'] as const).map((mode) => (
                      <ToggleGroupItem key={mode} value={mode} className="h-11 min-w-0 flex-1 px-1">
                        {t(`endModes.${mode}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </Field>
            {values.endMode === 'until' ? (
              <Field data-invalid={!!errors.until}>
                <FieldLabel htmlFor="create-until">{t('until')}</FieldLabel>
                <Input id="create-until" type="date" min={values.date} {...form.register('until')} />
                <ValidationMessage error={errors.until} />
              </Field>
            ) : (
              <Field data-invalid={!!errors.count}>
                <FieldLabel htmlFor="create-count">{t('count')}</FieldLabel>
                <Input
                  id="create-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200}
                  {...form.register('count', numberInput)}
                />
                <ValidationMessage error={errors.count} />
              </Field>
            )}
          </div>
        </div>
      )}
    </>
  );
}
