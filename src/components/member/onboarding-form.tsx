'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { completeOnboarding } from '@/features/auth/actions';
import { onboardingSchema, type OnboardingValues } from '@/features/auth/schema';
import type { AppErrorCode } from '@/lib/errors';

/** 첫 로그인 동의: 개인정보 수집·이용(필수) + 마케팅 수신(선택) */
export function OnboardingForm() {
  const t = useTranslations('welcome');
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { privacy: false, marketing: false },
  });
  const [privacy, marketing] = useWatch({ control: form.control, name: ['privacy', 'marketing'] });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding(values);
      if (!result.ok) setError(result.code);
    });
  });

  const toggleAll = (checked: boolean) => {
    form.setValue('privacy', checked, { shouldValidate: form.formState.isSubmitted });
    form.setValue('marketing', checked);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl bg-muted px-4 font-semibold">
        <Checkbox
          checked={privacy && marketing}
          onCheckedChange={(v) => toggleAll(v === true)}
          className="size-5"
        />
        {t('agreeAll')}
      </label>

      <div className="space-y-3 rounded-xl border p-4">
        <Controller
          control={form.control}
          name="privacy"
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  aria-invalid={!!fieldState.error}
                  className="size-5"
                />
                <Badge variant="default">{t('required')}</Badge>
                <span className="font-medium">{t('privacy')}</span>
              </label>
              <ul className="space-y-1 pl-8 text-sm text-muted-foreground">
                <li>{t('privacyItems')}</li>
                <li>{t('privacyPurpose')}</li>
                <li>{t('privacyPeriod')}</li>
              </ul>
              <div className="pl-8">
                <ValidationMessage error={fieldState.error} />
              </div>
            </div>
          )}
        />
        <Controller
          control={form.control}
          name="marketing"
          render={({ field }) => (
            <div className="space-y-1 border-t pt-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="size-5"
                />
                <Badge variant="secondary">{t('optional')}</Badge>
                <span className="font-medium">{t('marketing')}</span>
              </label>
              <p className="pl-8 text-sm text-muted-foreground">{t('marketingDetail')}</p>
            </div>
          )}
        />
      </div>

      <ErrorAlert code={error} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Spinner />}
        {t('submit')}
      </Button>
    </form>
  );
}
