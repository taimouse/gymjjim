'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ColorPicker } from '@/components/admin/color-picker';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { EditSheet } from '@/components/admin/edit-sheet';
import { PublishAtField } from '@/components/admin/publish-at-field';
import { ErrorAlert, useErrorText, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useProductsQuery } from '@/features/passes/queries';
import { deleteProgram, saveProgram } from '@/features/programs/actions';
import { programKeys } from '@/features/programs/queries';
import { PROGRAM_COLORS, programFormSchema, type ProgramFormValues } from '@/features/programs/schema';
import { useStaffQuery } from '@/features/staff/queries';
import type { AppErrorCode } from '@/lib/errors';
import { numberInput } from '@/lib/form';
import { addDaysToKey, todayKey } from '@/lib/format';

import { ProgramPaymentFields } from './program-payment-fields';

const NO_INSTRUCTOR = 'none';

/** 프로그램 생성·편집 드로어 */
export function ProgramSheet({
  open,
  onOpenChange,
  programId,
  initialValues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId?: string;
  initialValues: ProgramFormValues;
}) {
  const t = useTranslations('programs');
  const tCommon = useTranslations('common');
  const errorText = useErrorText();
  const { centerId, isOwner, timezone } = useAdmin();
  const queryClient = useQueryClient();
  const staff = useStaffQuery(centerId);
  const products = useProductsQuery(centerId);
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<ProgramFormValues>({
    resolver: zodResolver(programFormSchema),
    values: initialValues,
  });
  const { errors } = form.formState;
  const readOnly = !isOwner;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await saveProgram({ id: programId, values });
      if (!result.ok) return setError(result.code);
      await queryClient.invalidateQueries({ queryKey: programKeys.list(centerId) });
      toast.success(t('saved'));
      onOpenChange(false);
    });
  });

  const onDelete = () => {
    if (!programId) return;
    startTransition(async () => {
      const result = await deleteProgram(programId);
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: programKeys.list(centerId) });
      toast.success(t('deleted'));
      setConfirmDelete(false);
      onOpenChange(false);
    });
  };

  return (
    <EditSheet
      open={open}
      onOpenChange={onOpenChange}
      title={programId ? t('edit') : t('create')}
      footer={
        readOnly ? undefined : (
          <>
            {programId ? (
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
            <Button type="submit" form="program-form" disabled={pending}>
              {pending && <Spinner />}
              {tCommon('save')}
            </Button>
          </>
        )
      }
    >
      <form id="program-form" onSubmit={onSubmit} noValidate>
        <fieldset disabled={readOnly} className="space-y-6">
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="program-name">{t('fields.name')}</FieldLabel>
              <Input id="program-name" placeholder={t('fields.namePlaceholder')} {...form.register('name')} />
              <ValidationMessage error={errors.name} />
            </Field>
            <Field>
              <FieldLabel>{t('fields.type')}</FieldLabel>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
                    {(['group', 'private'] as const).map((type) => (
                      <label key={type} className="flex min-h-11 cursor-pointer items-center gap-2">
                        <RadioGroupItem value={type} />
                        {t(`type.${type}`)}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field data-invalid={!!errors.defaultCapacity}>
                <FieldLabel htmlFor="program-capacity">{t('fields.capacity')}</FieldLabel>
                <Input
                  id="program-capacity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  {...form.register('defaultCapacity', numberInput)}
                />
                <ValidationMessage error={errors.defaultCapacity} />
              </Field>
              <Field data-invalid={!!errors.durationMin}>
                <FieldLabel htmlFor="program-duration">{t('fields.duration')}</FieldLabel>
                <Input
                  id="program-duration"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  step={5}
                  {...form.register('durationMin', numberInput)}
                />
                <ValidationMessage error={errors.durationMin} />
              </Field>
            </div>
            <Field>
              <FieldLabel>{t('fields.color')}</FieldLabel>
              <Controller
                control={form.control}
                name="color"
                render={({ field }) => (
                  <ColorPicker
                    value={field.value}
                    onChange={field.onChange}
                    colors={PROGRAM_COLORS}
                    label={t('fields.color')}
                    disabled={readOnly}
                  />
                )}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="program-instructor">{t('fields.instructor')}</FieldLabel>
              <Controller
                control={form.control}
                name="defaultInstructorId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NO_INSTRUCTOR}
                    onValueChange={(value) => field.onChange(value === NO_INSTRUCTOR ? null : value)}
                    disabled={readOnly}
                  >
                    <SelectTrigger id="program-instructor" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_INSTRUCTOR}>{t('fields.instructorNone')}</SelectItem>
                      {(staff.data ?? []).map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <ProgramPaymentFields form={form} products={products.data ?? []} readOnly={readOnly} />
            <Field>
              <FieldLabel htmlFor="program-description">{t('fields.description')}</FieldLabel>
              <Textarea id="program-description" rows={3} {...form.register('description')} />
            </Field>
            <Controller
              control={form.control}
              name="publishAt"
              render={({ field, fieldState }) => (
                <PublishAtField
                  id="program-publish"
                  value={field.value}
                  onChange={field.onChange}
                  defaultDate={addDaysToKey(todayKey(timezone), 1)}
                  error={fieldState.error}
                  disabled={readOnly}
                />
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
