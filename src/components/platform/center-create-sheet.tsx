'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { EditSheet } from '@/components/admin/edit-sheet';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { createCenter } from '@/features/platform/actions';
import { platformKeys } from '@/features/platform/queries';
import { centerCreateSchema, type CenterCreateValues } from '@/features/platform/schema';
import type { AppErrorCode } from '@/lib/errors';
import { addDaysToKey, todayKey } from '@/lib/format';

import { PlanSelect } from './plan-select';

/** 체험 기본 기간 */
const TRIAL_DAYS = 14;

/** 새 센터 등록: 센터를 만들고 대표에게 초대 메일을 보낸다 */
export function CenterCreateSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (centerId: string) => void;
}) {
  const t = useTranslations('platform.centers.form');
  const tStatus = useTranslations('platform.status');
  const queryClient = useQueryClient();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<CenterCreateValues>({
    resolver: zodResolver(centerCreateSchema),
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      planId: '',
      status: 'trial',
      trialEndsAt: addDaysToKey(todayKey(), TRIAL_DAYS),
      ownerName: '',
      ownerEmail: '',
    },
  });
  const { errors } = form.formState;
  const status = useWatch({ control: form.control, name: 'status' });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await createCenter(values);
      if (!result.ok) return setError(result.code);
      await queryClient.invalidateQueries({ queryKey: platformKeys.all });
      const { invite } = result.data;
      if (invite === 'failed') toast.warning(t('createdInviteFailed'));
      else toast.success(invite === 'existing' ? t('createdExisting') : t('created'));
      onCreated(result.data.centerId);
      onClose();
    });
  });

  return (
    <EditSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('createTitle')}
      description={t('createDescription')}
      footer={
        <>
          <span />
          <Button type="submit" form="center-create-form" disabled={pending}>
            {pending && <Spinner />}
            {t('create')}
          </Button>
        </>
      }
    >
      <form id="center-create-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="center-name">{t('name')}</FieldLabel>
            <Input id="center-name" {...form.register('name')} />
            <ValidationMessage error={errors.name} />
          </Field>
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="center-phone">{t('phone')}</FieldLabel>
            <Input id="center-phone" type="tel" inputMode="tel" {...form.register('phone')} />
            <ValidationMessage error={errors.phone} />
          </Field>
          <Field data-invalid={!!errors.address}>
            <FieldLabel htmlFor="center-address">{t('address')}</FieldLabel>
            <Input id="center-address" {...form.register('address')} />
            <ValidationMessage error={errors.address} />
          </Field>
          <Field data-invalid={!!errors.planId}>
            <FieldLabel htmlFor="center-plan">{t('plan')}</FieldLabel>
            <Controller
              control={form.control}
              name="planId"
              render={({ field }) => (
                <PlanSelect id="center-plan" value={field.value} onChange={field.onChange} />
              )}
            />
            <ValidationMessage error={errors.planId} />
          </Field>
          <Field>
            <FieldLabel>{t('status')}</FieldLabel>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
                  {(['trial', 'active'] as const).map((value) => (
                    <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2">
                      <RadioGroupItem value={value} />
                      {tStatus(value)}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
          </Field>
          {status === 'trial' && (
            <Field data-invalid={!!errors.trialEndsAt}>
              <FieldLabel htmlFor="center-trial">{t('trialEndsAt')}</FieldLabel>
              <Input id="center-trial" type="date" {...form.register('trialEndsAt')} />
              <ValidationMessage error={errors.trialEndsAt} />
            </Field>
          )}
          <FieldSeparator />
          <Field data-invalid={!!errors.ownerName}>
            <FieldLabel htmlFor="center-owner-name">{t('ownerName')}</FieldLabel>
            <Input id="center-owner-name" {...form.register('ownerName')} />
            <ValidationMessage error={errors.ownerName} />
          </Field>
          <Field data-invalid={!!errors.ownerEmail}>
            <FieldLabel htmlFor="center-owner-email">{t('ownerEmail')}</FieldLabel>
            <Input id="center-owner-email" type="email" inputMode="email" {...form.register('ownerEmail')} />
            <FieldDescription>{t('ownerEmailHint')}</FieldDescription>
            <ValidationMessage error={errors.ownerEmail} />
          </Field>
        </FieldGroup>
        <ErrorAlert code={error} />
      </form>
    </EditSheet>
  );
}
