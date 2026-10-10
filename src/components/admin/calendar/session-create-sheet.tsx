'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { EditSheet } from '@/components/admin/edit-sheet';
import { PublishAtField } from '@/components/admin/publish-at-field';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useProgramsQuery } from '@/features/programs/queries';
import { createSessions } from '@/features/sessions/actions';
import { sessionKeys } from '@/features/sessions/queries';
import { expandRecurrence } from '@/features/sessions/recurrence';
import { sessionCreateSchema, type SessionCreateValues } from '@/features/sessions/schema';
import { useStaffQuery } from '@/features/staff/queries';
import type { AppErrorCode } from '@/lib/errors';
import { numberInput } from '@/lib/form';
import { addDaysToKey, todayKey } from '@/lib/format';

import { OccurrencePreview } from './occurrence-preview';
import { RecurrenceFields } from './recurrence-fields';

const NO_INSTRUCTOR = 'none';

export interface CreateDefaults {
  date: string;
  startTime: string;
  durationMin: number | null;
}

/** 수업 만들기 드로어 (빈 시간 드래그 또는 버튼) */
export function SessionCreateSheet({ defaults, onClose }: { defaults: CreateDefaults; onClose: () => void }) {
  const t = useTranslations('calendar');
  const { centerId, timezone } = useAdmin();
  const queryClient = useQueryClient();
  const programs = useProgramsQuery(centerId);
  const staff = useStaffQuery(centerId);
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<SessionCreateValues>({
    resolver: zodResolver(sessionCreateSchema),
    defaultValues: {
      programId: '',
      instructorId: null,
      date: defaults.date,
      startTime: defaults.startTime,
      durationMin: defaults.durationMin ?? 60,
      capacity: 10,
      repeat: false,
      frequency: 'weekly',
      interval: 1,
      weekdays: [],
      monthlyMode: 'date',
      monthWeeks: [],
      endMode: 'until',
      until: addDaysToKey(defaults.date, 27),
      count: 8,
      excludeDates: [],
      publishAt: '',
      note: '',
    },
  });
  const { errors } = form.formState;
  const values = useWatch({ control: form.control });
  const excludeDates = values.excludeDates ?? [];
  // 제외 전 전체 날짜 (미리보기에서 빼고 넣기 위해)
  const allOccurrences = sessionCreateSchema.safeParse({ ...values, excludeDates: [] }).success
    ? expandRecurrence({
        date: values.date ?? '',
        startTime: values.startTime ?? '00:00',
        durationMin: values.durationMin ?? 60,
        repeat: values.repeat ?? false,
        frequency: values.frequency,
        interval: values.interval,
        weekdays: values.weekdays ?? [],
        monthlyMode: values.monthlyMode,
        monthWeeks: values.monthWeeks ?? [],
        endMode: values.endMode,
        until: values.until ?? null,
        count: values.count,
        timeZone: timezone,
      })
    : [];
  const count = allOccurrences.filter((item) => !excludeDates.includes(item.date)).length;

  const toggleExclude = (date: string) =>
    form.setValue(
      'excludeDates',
      excludeDates.includes(date) ? excludeDates.filter((item) => item !== date) : [...excludeDates, date],
    );

  const onProgram = (programId: string) => {
    form.setValue('programId', programId, { shouldValidate: true });
    const program = programs.data?.find((item) => item.id === programId);
    if (!program) return;
    form.setValue('capacity', program.default_capacity);
    if (!defaults.durationMin || defaults.durationMin === 30)
      form.setValue('durationMin', program.duration_min);
    form.setValue('instructorId', program.default_instructor_id);
  };

  const onSubmit = form.handleSubmit((submitted) => {
    setError(null);
    startTransition(async () => {
      const result = await createSessions(submitted);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      toast.success(t('create.done', { count: result.data.count }));
      onClose();
    });
  });

  return (
    <EditSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('create.title')}
      footer={
        <>
          <span className="text-sm text-muted-foreground">{count > 0 && t('create.preview', { count })}</span>
          <Button type="submit" form="session-create-form" disabled={pending}>
            {pending && <Spinner />}
            {t('create.submit')}
          </Button>
        </>
      }
    >
      <form id="session-create-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <FieldGroup>
          <Field data-invalid={!!errors.programId}>
            <FieldLabel htmlFor="create-program">{t('create.program')}</FieldLabel>
            {(programs.data ?? []).length === 0 && !programs.isPending ? (
              <p className="text-muted-foreground">{t('create.noPrograms')}</p>
            ) : (
              <Select value={values.programId || undefined} onValueChange={onProgram}>
                <SelectTrigger id="create-program" className="w-full">
                  <SelectValue placeholder={t('create.programPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(programs.data ?? []).map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      <span className="size-3 rounded-full" style={{ backgroundColor: program.color }} />
                      {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ValidationMessage error={errors.programId} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.date}>
              <FieldLabel htmlFor="create-date">{t('create.date')}</FieldLabel>
              <Input id="create-date" type="date" {...form.register('date')} />
            </Field>
            <Field data-invalid={!!errors.startTime}>
              <FieldLabel htmlFor="create-time">{t('create.startTime')}</FieldLabel>
              <Input id="create-time" type="time" step={300} {...form.register('startTime')} />
            </Field>
            <Field data-invalid={!!errors.durationMin}>
              <FieldLabel htmlFor="create-duration">{t('create.duration')}</FieldLabel>
              <Input
                id="create-duration"
                type="number"
                inputMode="numeric"
                {...form.register('durationMin', numberInput)}
              />
              <ValidationMessage error={errors.durationMin} />
            </Field>
            <Field data-invalid={!!errors.capacity}>
              <FieldLabel htmlFor="create-capacity">{t('create.capacity')}</FieldLabel>
              <Input
                id="create-capacity"
                type="number"
                inputMode="numeric"
                {...form.register('capacity', numberInput)}
              />
              <ValidationMessage error={errors.capacity} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="create-instructor">{t('create.instructor')}</FieldLabel>
            <Controller
              control={form.control}
              name="instructorId"
              render={({ field }) => (
                <Select
                  value={field.value ?? NO_INSTRUCTOR}
                  onValueChange={(value) => field.onChange(value === NO_INSTRUCTOR ? null : value)}
                >
                  <SelectTrigger id="create-instructor" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_INSTRUCTOR}>{t('create.instructorNone')}</SelectItem>
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
          <RecurrenceFields form={form} />
          <OccurrencePreview occurrences={allOccurrences} excluded={excludeDates} onToggle={toggleExclude} />
          <Controller
            control={form.control}
            name="publishAt"
            render={({ field, fieldState }) => (
              <PublishAtField
                id="create-publish"
                value={field.value}
                onChange={field.onChange}
                defaultDate={todayKey(timezone)}
                error={fieldState.error}
              />
            )}
          />
          <Field>
            <FieldLabel htmlFor="create-note">{t('create.note')}</FieldLabel>
            <Textarea id="create-note" rows={2} {...form.register('note')} />
          </Field>
        </FieldGroup>
        <ErrorAlert code={error} />
      </form>
    </EditSheet>
  );
}
