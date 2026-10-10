'use client';

import { Coins, Ticket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';

import { useAdmin } from '@/components/admin/admin-context';
import { ValidationMessage } from '@/components/form-messages';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import type { ProgramFormValues } from '@/features/programs/schema';
import { numberInput } from '@/lib/form';
import { formatWon } from '@/lib/format';

/**
 * 예약 방법: ☑ 이용권(횟수권은 1회 차감 · 기간권은 차감 없음) / ☑ 크레딧(차감 크레딧). 둘 다 고를 수 있다.
 * 둘 다 받으면 회원이 예약할 때 쓸 수 있는 이용권을 먼저 쓰고, 없으면 크레딧을 쓴다.
 */
export function ProgramPaymentFields({
  form,
  products,
  readOnly,
}: {
  form: UseFormReturn<ProgramFormValues>;
  products: { id: string; name: string }[];
  readOnly: boolean;
}) {
  const t = useTranslations('programs.payment');
  const { creditPrice } = useAdmin();
  const { errors } = form.formState;
  const [usePass, useCredit, creditCost] = useWatch({
    control: form.control,
    name: ['usePass', 'useCredit', 'creditCost'],
  });

  return (
    <FieldSet>
      <FieldLegend>{t('title')}</FieldLegend>
      <FieldDescription>{t('description')}</FieldDescription>

      <MethodToggle
        name="usePass"
        form={form}
        icon={<Ticket className="size-4" aria-hidden />}
        label={t('pass')}
        hint={t('passHint')}
        disabled={readOnly}
      >
        {usePass && (
          <Field data-invalid={!!errors.allowedProductIds}>
            <FieldLabel className="sr-only">{t('products')}</FieldLabel>
            <Controller
              control={form.control}
              name="allowedProductIds"
              render={({ field }) =>
                products.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('noProductsYet')}</p>
                ) : (
                  <div className="divide-y rounded-lg border">
                    {products.map((product) => (
                      <label
                        key={product.id}
                        className="flex min-h-12 cursor-pointer items-center gap-3 px-3"
                      >
                        <Checkbox
                          checked={field.value.includes(product.id)}
                          disabled={readOnly}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked === true
                                ? [...field.value, product.id]
                                : field.value.filter((id) => id !== product.id),
                            )
                          }
                        />
                        <span className="flex-1">{product.name}</span>
                      </label>
                    ))}
                  </div>
                )
              }
            />
            <ValidationMessage error={errors.allowedProductIds} />
          </Field>
        )}
      </MethodToggle>

      <MethodToggle
        name="useCredit"
        form={form}
        icon={<Coins className="size-4" aria-hidden />}
        label={t('credit')}
        hint={t('creditHint')}
        disabled={readOnly}
      >
        {useCredit && (
          <Field data-invalid={!!errors.creditCost}>
            <FieldLabel htmlFor="program-credit-cost">{t('creditCost')}</FieldLabel>
            <InputGroup className="max-w-40">
              <InputGroupInput
                id="program-credit-cost"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                className="text-right tabular-nums"
                {...form.register('creditCost', numberInput)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>{t('creditUnit')}</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            {typeof creditCost === 'number' && creditCost > 0 && (
              <FieldDescription>
                {t('creditWorth', { total: formatWon(creditCost * creditPrice) })}
              </FieldDescription>
            )}
            <ValidationMessage error={errors.creditCost} />
          </Field>
        )}
      </MethodToggle>
      {!usePass && !useCredit && <ValidationMessage error={errors.useCredit} />}
    </FieldSet>
  );
}

function MethodToggle({
  name,
  form,
  icon,
  label,
  hint,
  disabled,
  children,
}: {
  name: 'usePass' | 'useCredit';
  form: UseFormReturn<ProgramFormValues>;
  icon: ReactNode;
  label: string;
  hint: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border p-3">
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              className="mt-0.5"
              checked={field.value}
              disabled={disabled}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-medium">
                {icon}
                {label}
              </span>
              <span className="block text-sm text-muted-foreground">{hint}</span>
            </span>
          </label>
        )}
      />
      {children}
    </div>
  );
}
