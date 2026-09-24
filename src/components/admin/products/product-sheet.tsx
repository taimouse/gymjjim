'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { EditSheet } from '@/components/admin/edit-sheet';
import { WonInput } from '@/components/admin/won-input';
import { ErrorAlert, useErrorText, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { deleteProduct, saveProduct } from '@/features/passes/actions';
import { productKeys } from '@/features/passes/queries';
import { PASS_TYPES, productFormSchema, type ProductFormValues } from '@/features/passes/schema';
import type { AppErrorCode } from '@/lib/errors';
import { numberInput } from '@/lib/form';

const DURATION_PRESETS = [30, 60, 90, 180, 365];

/** 이용권 상품 생성·편집 드로어 */
export function ProductSheet({
  open,
  onOpenChange,
  productId,
  initialValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId?: string;
  initialValues: ProductFormValues;
}) {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const errorText = useErrorText();
  const { centerId, isOwner } = useAdmin();
  const queryClient = useQueryClient();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    values: initialValues,
  });
  const { errors } = form.formState;
  const [type, useLimit] = useWatch({ control: form.control, name: ['type', 'useLimit'] });
  const readOnly = !isOwner;

  const refresh = () => queryClient.invalidateQueries({ queryKey: productKeys.list(centerId) });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await saveProduct({ id: productId, values });
      if (!result.ok) return setError(result.code);
      await refresh();
      toast.success(t('saved'));
      onOpenChange(false);
    });
  });

  const onDelete = () => {
    if (!productId) return;
    startTransition(async () => {
      const result = await deleteProduct(productId);
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await refresh();
      toast.success(t('deleted'));
      setConfirmDelete(false);
      onOpenChange(false);
    });
  };

  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title={productId ? t('edit') : t('create')}
      footer={
        readOnly ? undefined : (
          <>
            {productId ? (
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 aria-hidden />
                {t('delete')}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" form="product-form" disabled={pending}>
              {pending && <Spinner />}
              {tCommon('save')}
            </Button>
          </>
        )
      }
    >
      <form id="product-form" onSubmit={onSubmit} noValidate>
        <fieldset disabled={readOnly} className="space-y-6">
          <FieldGroup>
            <Field>
              <FieldLabel>{t('fields.type')}</FieldLabel>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    value={field.value}
                    onValueChange={(value) => value && field.onChange(value)}
                    className="w-full"
                  >
                    {PASS_TYPES.map((passType) => (
                      <ToggleGroupItem key={passType} value={passType} className="h-11 flex-1">
                        {t(`type.${passType}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
              <FieldDescription>{t(`typeHint.${type}`)}</FieldDescription>
            </Field>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="product-name">{t('fields.name')}</FieldLabel>
              <Input id="product-name" placeholder={t('fields.namePlaceholder')} {...form.register('name')} />
              <ValidationMessage error={errors.name} />
            </Field>
            {type !== 'count' && (
              <Field data-invalid={!!errors.durationDays}>
                <FieldLabel htmlFor="product-duration">{t('fields.duration')}</FieldLabel>
                <Input
                  id="product-duration"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  {...form.register('durationDays', numberInput)}
                />
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((days) => (
                    <Button
                      key={days}
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => form.setValue('durationDays', days, { shouldValidate: true })}
                    >
                      {t('presets.days', { days })}
                    </Button>
                  ))}
                </div>
                <ValidationMessage error={errors.durationDays} />
              </Field>
            )}
            {type !== 'period' && (
              <Field data-invalid={!!errors.totalCount}>
                <FieldLabel htmlFor="product-count">{t('fields.count')}</FieldLabel>
                <Input
                  id="product-count"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  {...form.register('totalCount', numberInput)}
                />
                <ValidationMessage error={errors.totalCount} />
              </Field>
            )}
            <Field>
              <Controller
                control={form.control}
                name="useLimit"
                render={({ field }) => (
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                    <span className="font-medium">{t('fields.useLimit')}</span>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </label>
                )}
              />
              {useLimit && (
                <div className="grid grid-cols-2 gap-3">
                  <Controller
                    control={form.control}
                    name="limitUnit"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange} disabled={readOnly}>
                        <SelectTrigger className="w-full" aria-label={t('fields.limitUnit')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="week">{t('unit.week')}</SelectItem>
                          <SelectItem value="month">{t('unit.month')}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    aria-label={t('fields.limitCount')}
                    {...form.register('limitCount', numberInput)}
                  />
                </div>
              )}
              <ValidationMessage error={errors.limitCount} />
            </Field>
            <Field data-invalid={!!errors.price}>
              <FieldLabel htmlFor="product-price">{t('fields.price')}</FieldLabel>
              <Controller
                control={form.control}
                name="price"
                render={({ field }) => (
                  <WonInput
                    id="product-price"
                    unit={tCommon('won')}
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? 0)}
                  />
                )}
              />
              <ValidationMessage error={errors.price} />
            </Field>
            <Controller
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <label className="flex cursor-pointer items-start justify-between gap-3">
                  <span className="space-y-1">
                    <span className="block font-medium">{t('fields.active')}</span>
                    <span className="block text-sm text-muted-foreground">{t('fields.activeHint')}</span>
                  </span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          </FieldGroup>
          <ErrorAlert code={error} />
        </fieldset>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteConfirm.title')}
        description={t('deleteConfirm.description')}
        confirmLabel={tCommon('delete')}
        onConfirm={onDelete}
        pending={pending}
      />
    </EditSheet>
  );
}
