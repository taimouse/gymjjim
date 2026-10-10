'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ColorPicker } from '@/components/admin/color-picker';
import { EditSheet } from '@/components/admin/edit-sheet';
import { PublishAtField } from '@/components/admin/publish-at-field';
import { ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PROGRAM_COLORS, programFormSchema, type ProgramFormValues } from '@/features/programs/schema';
import { localToUtc } from '@/features/sessions/recurrence';
import { numberInput } from '@/lib/form';
import { addDaysToKey, todayKey } from '@/lib/format';

import { protoActions } from '../lib/store';
import type { ProtoState } from '../lib/types';

const NO_INSTRUCTOR = 'none';

/** 프로그램 만들기·수정 (공개 예약 포함, 저장은 브라우저) */
export function ProgramSheet({
  state,
  programId,
  initialValues,
  onClose,
}: {
  state: ProtoState;
  programId?: string;
  initialValues: ProgramFormValues;
  onClose: () => void;
}) {
  const t = useTranslations('programs');
  const tCommon = useTranslations('common');
  const tProto = useTranslations('prototype.admin');
  const timezone = state.center.timezone;
  const form = useForm<ProgramFormValues>({
    resolver: zodResolver(programFormSchema),
    values: initialValues,
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    protoActions.saveProgram({
      id: programId,
      name: values.name,
      type: values.type,
      default_capacity: values.defaultCapacity,
      duration_min: values.durationMin,
      color: values.color,
      description: values.description || null,
      default_instructor_id: values.defaultInstructorId,
      publish_at: values.publishAt
        ? localToUtc(values.publishAt.slice(0, 10), values.publishAt.slice(11), timezone)
        : null,
    });
    toast.success(tProto('programSaved'));
    onClose();
  });

  return (
    <EditSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={programId ? t('edit') : t('create')}
      footer={
        <>
          {programId ? (
            <Button
              type="button"
              variant="ghost"
              className="text-danger"
              onClick={() => {
                protoActions.deleteProgram(programId);
                toast.success(tProto('programDeleted'));
                onClose();
              }}
            >
              <Trash2 aria-hidden />
              {t('delete')}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" form="proto-program-form">
            {tCommon('save')}
          </Button>
        </>
      }
    >
      <form id="proto-program-form" onSubmit={onSubmit} noValidate>
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
              <Input id="program-capacity" type="number" {...form.register('defaultCapacity', numberInput)} />
              <ValidationMessage error={errors.defaultCapacity} />
            </Field>
            <Field data-invalid={!!errors.durationMin}>
              <FieldLabel htmlFor="program-duration">{t('fields.duration')}</FieldLabel>
              <Input
                id="program-duration"
                type="number"
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
                >
                  <SelectTrigger id="program-instructor" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_INSTRUCTOR}>{t('fields.instructorNone')}</SelectItem>
                    {state.staff.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
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
              />
            )}
          />
        </FieldGroup>
      </form>
    </EditSheet>
  );
}
