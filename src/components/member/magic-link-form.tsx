'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';

import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { sendMagicLink } from '@/features/auth/actions';
import { magicLinkSchema, type MagicLinkValues } from '@/features/auth/schema';
import type { AppErrorCode } from '@/lib/errors';

/** 이메일 매직링크 로그인 (카카오 보조) */
export function MagicLinkForm({ next }: { next: string }) {
  const t = useTranslations('auth');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<MagicLinkValues>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: '', next },
  });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await sendMagicLink(values);
      if (result.ok) setSentTo(result.data.email);
      else setError(result.code);
    });
  });

  if (sentTo) {
    return (
      <div className="space-y-2 rounded-xl bg-success-soft p-4 text-success-soft-foreground" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <MailCheck className="size-5" aria-hidden />
          {t('checkEmail.title')}
        </p>
        <p className="text-sm">{t('checkEmail.description', { email: sentTo })}</p>
        <p className="text-sm opacity-80">{t('checkEmail.hint')}</p>
        <Button type="button" variant="link" className="h-auto px-0" onClick={() => setSentTo(null)}>
          {t('checkEmail.retry')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <Field data-invalid={!!form.formState.errors.email}>
        <FieldLabel htmlFor="magic-email">{t('memberLogin.emailLabel')}</FieldLabel>
        <Input
          id="magic-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t('memberLogin.emailPlaceholder')}
          aria-invalid={!!form.formState.errors.email}
          {...form.register('email')}
        />
        <ValidationMessage error={form.formState.errors.email} />
      </Field>
      <ErrorAlert code={error} />
      <Button type="submit" variant="outline" size="lg" className="w-full" disabled={pending}>
        {pending && <Spinner />}
        {t('memberLogin.sendLink')}
      </Button>
    </form>
  );
}
