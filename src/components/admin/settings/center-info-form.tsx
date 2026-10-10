'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { updateCenterInfo } from '@/features/centers/actions';
import { centerInfoFormSchema, type CenterInfoFormValues } from '@/features/centers/schema';
import type { AppErrorCode } from '@/lib/errors';
import { formatPhone } from '@/lib/format';

export function CenterInfoForm({ initial }: { initial: CenterInfoFormValues }) {
  const t = useTranslations('settings.center');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { isOwner } = useAdmin();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<CenterInfoFormValues>({
    resolver: zodResolver(centerInfoFormSchema),
    defaultValues: { ...initial, phone: formatPhone(initial.phone) },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await updateCenterInfo(values);
      if (!result.ok) return setError(result.code);
      toast.success(t('saved'));
      router.refresh();
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!isOwner}>
          <CardContent>
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
              <Field>
                <FieldLabel htmlFor="center-address">{t('address')}</FieldLabel>
                <Input id="center-address" {...form.register('address')} />
              </Field>
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
