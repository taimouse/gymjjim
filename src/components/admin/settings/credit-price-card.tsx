'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Coins } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { WonInput } from '@/components/admin/won-input';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { updateCreditPrice } from '@/features/credits/actions';
import { type CreditPriceValues, creditPriceSchema } from '@/features/credits/schema';
import type { AppErrorCode } from '@/lib/errors';
import { formatWon } from '@/lib/format';
import { cn } from '@/lib/utils';

const EXAMPLE_CREDITS = 10;

/** 크레딧 1개 가격 (대표). 회원 충전 요청 금액 = 개수 × 가격 */
export function CreditPriceCard({ initial }: { initial: number }) {
  const t = useTranslations('settings.credits');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { isOwner } = useAdmin();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<CreditPriceValues>({
    resolver: zodResolver(creditPriceSchema),
    defaultValues: { price: initial },
  });
  const { errors } = form.formState;
  const price = useWatch({ control: form.control, name: 'price' });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await updateCreditPrice(values);
      if (!result.ok) return setError(result.code);
      toast.success(t('saved'));
      router.refresh();
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Coins className="size-5 text-primary" aria-hidden />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col">
        <fieldset disabled={!isOwner} className="flex min-w-0 flex-1 flex-col">
          <CardContent className={cn('flex-1', isOwner && 'pb-6')}>
            <FieldGroup>
              <Field data-invalid={!!errors.price}>
                <FieldLabel htmlFor="credit-price">{t('price')}</FieldLabel>
                <Controller
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <div className="max-w-40">
                      <WonInput
                        id="credit-price"
                        unit={t('won')}
                        value={field.value ?? null}
                        onChange={(value) => field.onChange(value ?? Number.NaN)}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    </div>
                  )}
                />
                <FieldDescription>
                  {t('example', {
                    count: EXAMPLE_CREDITS,
                    total: formatWon((Number.isFinite(price) ? price : 0) * EXAMPLE_CREDITS),
                  })}
                </FieldDescription>
                <ValidationMessage error={errors.price} />
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
