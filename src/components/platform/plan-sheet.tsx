'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { EditSheet } from '@/components/admin/edit-sheet';
import { WonInput } from '@/components/admin/won-input';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { savePlan } from '@/features/platform/actions';
import { platformKeys, type PlanRow } from '@/features/platform/queries';
import { planSchema, type PlanValues } from '@/features/platform/schema';
import type { AppErrorCode } from '@/lib/errors';

function toLimit(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  return digits ? Number.parseInt(digits, 10) : null;
}

/** 요금제 추가·수정 드로어. 한도를 비우면 무제한 */
export function PlanSheet({
  plan,
  nextSortOrder,
  onClose,
}: {
  plan: PlanRow | null;
  nextSortOrder: number;
  onClose: () => void;
}) {
  const t = useTranslations('platform.plans');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<PlanValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      id: plan?.id ?? null,
      code: plan?.code ?? '',
      name: plan?.name ?? '',
      monthlyPrice: plan?.monthly_price ?? 0,
      maxMembers: plan?.max_members ?? null,
      maxStaff: plan?.max_staff ?? null,
      isActive: plan?.is_active ?? true,
      sortOrder: plan?.sort_order ?? nextSortOrder,
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await savePlan(values);
      if (!result.ok) return setError(result.code);
      await queryClient.invalidateQueries({ queryKey: platformKeys.all });
      toast.success(t('saved'));
      onClose();
    });
  });

  return (
    <EditSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={plan ? t('editTitle') : t('createTitle')}
      description={t('sheetDescription')}
      footer={
        <>
          <span />
          <Button type="submit" form="plan-form" disabled={pending}>
            {pending && <Spinner />}
            {tCommon('save')}
          </Button>
        </>
      }
    >
      <form id="plan-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="plan-name">{t('name')}</FieldLabel>
            <Input id="plan-name" {...form.register('name')} />
            <ValidationMessage error={errors.name} />
          </Field>
          <Field data-invalid={!!errors.code}>
            <FieldLabel htmlFor="plan-code">{t('code')}</FieldLabel>
            <Input id="plan-code" autoCapitalize="none" spellCheck={false} {...form.register('code')} />
            <FieldDescription>{t('codeHint')}</FieldDescription>
            <ValidationMessage error={errors.code} />
          </Field>
          <Field data-invalid={!!errors.monthlyPrice}>
            <FieldLabel htmlFor="plan-price">{t('monthlyPrice')}</FieldLabel>
            <Controller
              control={form.control}
              name="monthlyPrice"
              render={({ field }) => (
                <WonInput
                  id="plan-price"
                  unit={tCommon('won')}
                  value={field.value}
                  onChange={(value) => field.onChange(value ?? 0)}
                  onBlur={field.onBlur}
                />
              )}
            />
            <ValidationMessage error={errors.monthlyPrice} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['maxMembers', 'maxStaff'] as const).map((name) => (
              <Field key={name} data-invalid={!!errors[name]}>
                <FieldLabel htmlFor={`plan-${name}`}>{t(name)}</FieldLabel>
                <Controller
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <Input
                      id={`plan-${name}`}
                      inputMode="numeric"
                      autoComplete="off"
                      className="text-right tabular-nums"
                      placeholder={t('unlimited')}
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(toLimit(event.target.value))}
                      onBlur={field.onBlur}
                    />
                  )}
                />
                <ValidationMessage error={errors[name]} />
              </Field>
            ))}
          </div>
          <p className="-mt-2 text-sm text-muted-foreground">{t('unlimitedHint')}</p>
          <Field orientation="horizontal" className="justify-between">
            <FieldLabel htmlFor="plan-active">{t('isActive')}</FieldLabel>
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <Switch id="plan-active" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </Field>
          <p className="-mt-2 text-sm text-muted-foreground">{t('isActiveHint')}</p>
        </FieldGroup>
        <ErrorAlert code={error} />
      </form>
    </EditSheet>
  );
}
