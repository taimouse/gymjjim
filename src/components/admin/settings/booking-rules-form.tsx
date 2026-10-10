'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { updateBookingRules } from '@/features/centers/actions';
import { bookingRulesFormSchema, type BookingRulesFormValues } from '@/features/centers/schema';
import type { AppErrorCode } from '@/lib/errors';
import { numberInput } from '@/lib/form';
import { cn } from '@/lib/utils';

const FIELDS = [
  { name: 'openDaysBefore', label: 'openDays', unit: 'openDaysUnit', hint: 'openDaysHint', hintArg: 'days' },
  {
    name: 'closeMinutesBefore',
    label: 'closeMinutes',
    unit: 'closeMinutesUnit',
    hint: 'closeMinutesHint',
    hintArg: 'minutes',
  },
  {
    name: 'freeCancelHoursBefore',
    label: 'freeCancelHours',
    unit: 'freeCancelHoursUnit',
    hint: 'freeCancelHoursHint',
    hintArg: 'hours',
  },
] as const;

/** 예약 규칙 (CLAUDE.md 5번 값들) */
export function BookingRulesForm({ initial }: { initial: BookingRulesFormValues }) {
  const t = useTranslations('settings.rules');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { isOwner } = useAdmin();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<BookingRulesFormValues>({
    resolver: zodResolver(bookingRulesFormSchema),
    defaultValues: initial,
  });
  const { errors } = form.formState;
  const values = useWatch({ control: form.control });

  const onSubmit = form.handleSubmit((submitted) => {
    setError(null);
    startTransition(async () => {
      const result = await updateBookingRules(submitted);
      if (!result.ok) return setError(result.code);
      toast.success(t('saved'));
      router.refresh();
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
        <fieldset disabled={!isOwner} className="flex min-w-0 flex-1 flex-col">
          <CardContent className={cn('flex-1', isOwner && 'pb-6')}>
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-3">
                {FIELDS.map((field) => (
                  <Field key={field.name} data-invalid={!!errors[field.name]}>
                    <FieldLabel htmlFor={`rule-${field.name}`}>{t(field.label)}</FieldLabel>
                    <InputGroup className="max-w-40">
                      <InputGroupInput
                        id={`rule-${field.name}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        className="text-right tabular-nums"
                        {...form.register(field.name, numberInput)}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>{t(field.unit)}</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    <FieldDescription>
                      {t(field.hint, { [field.hintArg]: values[field.name] ?? 0 })}
                    </FieldDescription>
                    <ValidationMessage error={errors[field.name]} />
                  </Field>
                ))}
              </div>
              <Controller
                control={form.control}
                name="autoPromoteWaitlist"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-start justify-between gap-4">
                    <span className="space-y-1">
                      <span className="block font-medium">{t('autoPromote')}</span>
                      <span className="block text-sm text-muted-foreground">{t('autoPromoteHint')}</span>
                    </span>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </label>
                )}
              />
              <ErrorAlert code={error} />
            </FieldGroup>
          </CardContent>
          {isOwner && (
            <CardFooter className="justify-end">
              <Button type="submit" disabled={pending}>
                {pending && <Spinner />}
                {tCommon('save')}
              </Button>
            </CardFooter>
          )}
        </fieldset>
      </form>
    </Card>
  );
}
