'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { WonInput } from '@/components/admin/won-input';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { grantPass } from '@/features/members/actions';
import { memberKeys } from '@/features/members/queries';
import { grantPassSchema, type GrantPassValues } from '@/features/members/schema';
import { useProductsQuery } from '@/features/passes/queries';
import type { AppErrorCode } from '@/lib/errors';
import { addDaysToKey, formatDateKey, formatWon, todayKey } from '@/lib/format';

/** 이용권 부여: 상품 선택 → 시작일 → 만료일·횟수 자동 계산 → 결제 금액 기록 */
export function GrantPassDialog({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const t = useTranslations('members.grant');
  const tProducts = useTranslations('products');
  const tCommon = useTranslations('common');
  const { centerId, timezone } = useAdmin();
  const queryClient = useQueryClient();
  const products = useProductsQuery(centerId);
  const activeProducts = (products.data ?? []).filter((product) => product.is_active);
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const today = todayKey(timezone);
  const form = useForm<GrantPassValues>({
    resolver: zodResolver(grantPassSchema),
    defaultValues: { memberId, productId: '', startDate: today, paidAmount: 0, paidAt: today, memo: '' },
  });
  const { errors } = form.formState;
  const [productId, startDate] = useWatch({ control: form.control, name: ['productId', 'startDate'] });
  const product = activeProducts.find((item) => item.id === productId);
  const endDate =
    product?.duration_days && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? addDaysToKey(startDate, product.duration_days - 1)
      : null;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await grantPass(values);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: memberKeys.all });
      toast.success(t('done'));
      onClose();
    });
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        {activeProducts.length === 0 && !products.isPending ? (
          <p className="text-muted-foreground">{t('noProducts')}</p>
        ) : (
          <form id="grant-pass-form" onSubmit={onSubmit} noValidate className="space-y-5">
            <FieldGroup>
              <Field data-invalid={!!errors.productId}>
                <FieldLabel>{t('product')}</FieldLabel>
                <Controller
                  control={form.control}
                  name="productId"
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={(value) => {
                        field.onChange(value);
                        const selected = activeProducts.find((item) => item.id === value);
                        if (selected) form.setValue('paidAmount', selected.price);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('productPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {activeProducts.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} · {formatWon(item.price)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <ValidationMessage error={errors.productId} />
              </Field>
              <Field data-invalid={!!errors.startDate}>
                <FieldLabel htmlFor="grant-start">{t('startDate')}</FieldLabel>
                <Input id="grant-start" type="date" {...form.register('startDate')} />
                <ValidationMessage error={errors.startDate} />
              </Field>
              {product && (
                <dl className="grid grid-cols-2 gap-3 rounded-xl bg-brand-soft p-4 text-brand-soft-foreground">
                  <div>
                    <dt className="text-sm">{t('summary')}</dt>
                    <dd className="text-lg font-bold">
                      {endDate ? formatDateKey(endDate, { year: true }) : tProducts('noExpiry')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm">{t('summaryCount')}</dt>
                    <dd className="text-lg font-bold">
                      {product.total_count === null
                        ? tProducts('unlimited')
                        : tProducts('countTimes', { count: product.total_count })}
                    </dd>
                  </div>
                </dl>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field data-invalid={!!errors.paidAmount}>
                  <FieldLabel htmlFor="grant-amount">{t('paidAmount')}</FieldLabel>
                  <Controller
                    control={form.control}
                    name="paidAmount"
                    render={({ field }) => (
                      <WonInput
                        id="grant-amount"
                        unit={tCommon('won')}
                        value={field.value}
                        onChange={(value) => field.onChange(value ?? 0)}
                      />
                    )}
                  />
                  <ValidationMessage error={errors.paidAmount} />
                </Field>
                <Field data-invalid={!!errors.paidAt}>
                  <FieldLabel htmlFor="grant-paid-at">{t('paidAt')}</FieldLabel>
                  <Input id="grant-paid-at" type="date" {...form.register('paidAt')} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="grant-memo">{t('memo')}</FieldLabel>
                <Input id="grant-memo" {...form.register('memo')} />
              </Field>
            </FieldGroup>
            <ErrorAlert code={error} />
          </form>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" form="grant-pass-form" disabled={pending || activeProducts.length === 0}>
            {pending && <Spinner />}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
