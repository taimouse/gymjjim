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
import { signInAdmin } from '@/features/auth/actions';
import { adminLoginSchema, type AdminLoginValues } from '@/features/auth/schema';
import type { AppErrorCode } from '@/lib/errors';

export function AdminLoginForm({ next }: { next: string }) {
  const t = useTranslations('auth.adminLogin');
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: '', password: '', next },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await signInAdmin(values);
      if (!result.ok) setError(result.code);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="admin-email">{t('email')}</FieldLabel>
          <Input
            id="admin-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
          <ValidationMessage error={errors.email} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="admin-password">{t('password')}</FieldLabel>
          <Input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...form.register('password')}
          />
          <ValidationMessage error={errors.password} />
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
