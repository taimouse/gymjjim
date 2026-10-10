'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { adjustCredits } from '@/features/credits/actions';
import { creditKeys } from '@/features/credits/queries';
import { type AdjustCreditsValues, adjustCreditsSchema, CREDIT_MAX } from '@/features/credits/schema';
import type { AppErrorCode } from '@/lib/errors';
import { numberInput } from '@/lib/form';
import { formatWon } from '@/lib/format';

/** 직원 직접 충전(현장 결제 등) · 차감(정정). 충전이면 받을 금액(개수 × 1개 가격)을 함께 보여준다 */
export function AdjustCreditsDialog({
  memberId,
  mode,
  balance,
  onClose,
}: {
  memberId: string;
  mode: AdjustCreditsValues['mode'];
  balance: number;
  onClose: () => void;
}) {
  const t = useTranslations('credits.adjust');
  const tCommon = useTranslations('common');
  const { creditPrice } = useAdmin();
  const queryClient = useQueryClient();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<AdjustCreditsValues>({
    resolver: zodResolver(adjustCreditsSchema),
    defaultValues: { memberId, mode, amount: mode === 'charge' ? 10 : 1, memo: '' },
  });
  const { errors } = form.formState;
  const amount = useWatch({ control: form.control, name: 'amount' });
  const valid = Number.isInteger(amount) && amount >= 1 && amount <= CREDIT_MAX;
  const after = mode === 'charge' ? balance + (valid ? amount : 0) : balance - (valid ? amount : 0);

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await adjustCredits(values);
      if (!result.ok) return setError(result.code);
      await queryClient.invalidateQueries({ queryKey: creditKeys.all });
      toast.success(t(mode === 'charge' ? 'charged' : 'deducted', { amount: values.amount }));
      onClose();
    });
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>{t(mode === 'charge' ? 'chargeTitle' : 'deductTitle')}</DialogTitle>
            <DialogDescription>{t(mode === 'charge' ? 'chargeHint' : 'deductHint')}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field data-invalid={!!errors.amount}>
              <FieldLabel htmlFor="credit-amount">{t('amount')}</FieldLabel>
              <InputGroup className="max-w-48">
                <InputGroupInput
                  id="credit-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={CREDIT_MAX}
                  className="text-right tabular-nums"
                  {...form.register('amount', numberInput)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{t('unit')}</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <ValidationMessage error={errors.amount} />
            </Field>
            <Field data-invalid={!!errors.memo}>
              <FieldLabel htmlFor="credit-memo">{t('memo')}</FieldLabel>
              <Input id="credit-memo" placeholder={t('memoPlaceholder')} {...form.register('memo')} />
              <ValidationMessage error={errors.memo} />
            </Field>
            <p className="rounded-xl bg-muted/60 p-4 font-medium" role="status">
              {t('after', { before: balance, after })}
              {mode === 'charge' && valid && (
                <span className="block text-sm text-muted-foreground">
                  {t('paid', { total: formatWon(amount * creditPrice) })}
                </span>
              )}
            </p>
            <ErrorAlert code={error} />
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" variant={mode === 'charge' ? 'default' : 'destructive'} disabled={pending}>
              {pending && <Spinner />}
              {t(mode === 'charge' ? 'chargeSubmit' : 'deductSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
