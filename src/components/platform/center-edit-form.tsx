'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { updateCenter } from '@/features/platform/actions';
import { type PlatformCenterRow, platformKeys } from '@/features/platform/queries';
import {
  CENTER_STATUSES,
  type CenterStatus,
  centerUpdateSchema,
  type CenterUpdateValues,
} from '@/features/platform/schema';
import type { AppErrorCode } from '@/lib/errors';

import { PlanSelect } from './plan-select';

const BLOCKING: readonly CenterStatus[] = ['suspended', 'closed'];

/**
 * 요금제·상태·체험 종료일·운영 메모 변경.
 * 정지·해지로 바꿀 때만 확인창 (대표·직원·회원 모두 바로 이용할 수 없게 된다).
 */
export function CenterEditForm({ center }: { center: PlatformCenterRow }) {
  const t = useTranslations('platform.centers.detail');
  const tStatus = useTranslations('platform.status');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [confirming, setConfirming] = useState<CenterUpdateValues | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<CenterUpdateValues>({
    resolver: zodResolver(centerUpdateSchema),
    defaultValues: {
      id: center.id,
      planId: center.plan_id ?? '',
      status: center.status,
      trialEndsAt: center.trial_ends_at ?? '',
      memo: center.memo,
    },
  });
  const { errors, isDirty } = form.formState;
  const status = useWatch({ control: form.control, name: 'status' });

  const save = (values: CenterUpdateValues) => {
    setError(null);
    startTransition(async () => {
      const result = await updateCenter(values);
      setConfirming(null);
      if (!result.ok) return setError(result.code);
      await queryClient.invalidateQueries({ queryKey: platformKeys.all });
      form.reset(values);
      toast.success(t('saved'));
    });
  };

  const onSubmit = form.handleSubmit((values) => {
    const blocking = BLOCKING.includes(values.status) && !BLOCKING.includes(center.status);
    if (blocking) setConfirming(values);
    else save(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FieldGroup>
        <Field data-invalid={!!errors.planId}>
          <FieldLabel htmlFor="edit-plan">{t('plan')}</FieldLabel>
          <Controller
            control={form.control}
            name="planId"
            render={({ field }) => (
              <PlanSelect id="edit-plan" value={field.value} onChange={field.onChange} />
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
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                className="grid grid-cols-2 gap-x-6"
              >
                {CENTER_STATUSES.map((value) => (
                  <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2">
                    <RadioGroupItem value={value} />
                    {tStatus(value)}
                  </label>
                ))}
              </RadioGroup>
            )}
          />
          {BLOCKING.includes(status) && <FieldDescription>{t('blockingHint')}</FieldDescription>}
        </Field>
        {status === 'trial' && (
          <Field data-invalid={!!errors.trialEndsAt}>
            <FieldLabel htmlFor="edit-trial">{t('trialEndsAt')}</FieldLabel>
            <Input id="edit-trial" type="date" {...form.register('trialEndsAt')} />
            <ValidationMessage error={errors.trialEndsAt} />
          </Field>
        )}
        <Field data-invalid={!!errors.memo}>
          <FieldLabel htmlFor="edit-memo">{t('memo')}</FieldLabel>
          <Textarea id="edit-memo" rows={3} {...form.register('memo')} />
          <FieldDescription>{t('memoHint')}</FieldDescription>
          <ValidationMessage error={errors.memo} />
        </Field>
      </FieldGroup>
      <ErrorAlert code={error} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !isDirty}>
          {pending && <Spinner />}
          {tCommon('save')}
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title={t('blockConfirm.title', { name: center.name, status: tStatus(confirming.status) })}
          description={t('blockConfirm.description')}
          confirmLabel={t('blockConfirm.confirm', { status: tStatus(confirming.status) })}
          pending={pending}
          onConfirm={() => save(confirming)}
        />
      )}
    </form>
  );
}
