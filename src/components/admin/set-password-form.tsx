'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { setPassword } from '@/features/auth/actions';
import { setPasswordSchema, type SetPasswordValues } from '@/features/auth/schema';
import type { AppErrorCode } from '@/lib/errors';

/** 초대받은 직원이 처음 비밀번호를 정한다 */
export function SetPasswordForm() {
  const t = useTranslations('auth.setPassword');
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await setPassword(values);
      if (!result.ok) setError(result.code);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FieldGroup>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="new-password">{t('password')}</FieldLabel>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
          <ValidationMessage error={errors.password} />
        </Field>
        <Field data-invalid={!!errors.confirm}>
          <FieldLabel htmlFor="confirm-password">{t('confirm')}</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirm}
            {...form.register('confirm')}
          />
          <ValidationMessage error={errors.confirm} />
        </Field>
      </FieldGroup>
      <ErrorAlert code={error} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Spinner />}
        {t('submit')}
      </Button>
    </form>
  );
}
