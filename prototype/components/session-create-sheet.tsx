'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { OccurrencePreview } from '@/components/admin/calendar/occurrence-preview';
import { RecurrenceFields } from '@/components/admin/calendar/recurrence-fields';
import { EditSheet } from '@/components/admin/edit-sheet';
import { PublishAtField } from '@/components/admin/publish-at-field';
import { ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { expandRecurrence, localToUtc } from '@/features/sessions/recurrence';
import { sessionCreateSchema, type SessionCreateValues } from '@/features/sessions/schema';
import { numberInput } from '@/lib/form';
import { addDaysToKey, todayKey } from '@/lib/format';

import { protoActions } from '../lib/store';
import type { ProtoState } from '../lib/types';

export interface CreateDefaults {
  date: string;
  startTime: string;
  durationMin: number | null;
}

const NO_INSTRUCTOR = 'none';

/** 수업 만들기 (실제 앱과 같은 반복·공개 예약 입력, 저장은 브라우저) */
export function SessionCreateSheet({
  state,
  defaults,
  onClose,
}: {
  state: ProtoState;
  defaults: CreateDefaults;
  onClose: () => void;
}) {
  const t = useTranslations('calendar');
  const tProto = useTranslations('prototype.admin');
  const timezone = state.center.timezone;
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
  const values = useWatch({ control: form.control }) as SessionCreateValues;
  const excludeDates = values.excludeDates ?? [];
  const allOccurrences = sessionCreateSchema.safeParse({ ...values, excludeDates: [] }).success
    ? expandRecurrence({ ...values, excludeDates: [], timeZone: timezone })
    : [];
  const count = allOccurrences.filter((item) => !excludeDates.includes(item.date)).length;

  const onProgram = (programId: string) => {
    form.setValue('programId', programId, { shouldValidate: true });
    const program = state.programs.find((item) => item.id === programId);
    if (!program) return;
    form.setValue('capacity', program.default_capacity);
    form.setValue('durationMin', program.duration_min);
    form.setValue('instructorId', program.default_instructor_id);
  };

  const onSubmit = form.handleSubmit((submitted) => {
    const occurrences = expandRecurrence({ ...submitted, timeZone: timezone });
    const publishAt = submitted.publishAt
      ? localToUtc(submitted.publishAt.slice(0, 10), submitted.publishAt.slice(11), timezone)
      : null;
    protoActions.createSessions(
      occurrences.map((occurrence) => ({
        program_id: submitted.programId,
        instructor_id: submitted.instructorId,
        starts_at: occurrence.startsAt,
        ends_at: occurrence.endsAt,
        capacity: submitted.capacity,
        status: 'scheduled' as const,
        note: submitted.note || null,
        publish_at: publishAt,
      })),
    );
    toast.success(tProto('sessionsCreated', { count: occurrences.length }));
    onClose();
  });

  return (
    <EditSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('create.title')}
      footer={
        <>
          <span className="text-sm text-muted-foreground">{count > 0 && t('create.preview', { count })}</span>
          <Button type="submit" form="proto-session-form">
            {t('create.submit')}
          </Button>
        </>
      }
    >
      <form id="proto-session-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <FieldGroup>
          <Field data-invalid={!!errors.programId}>
            <FieldLabel htmlFor="proto-program">{t('create.program')}</FieldLabel>
            <Select value={values.programId || undefined} onValueChange={onProgram}>
              <SelectTrigger id="proto-program" className="w-full">
                <SelectValue placeholder={t('create.programPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {state.programs.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    <span className="size-3 rounded-full" style={{ backgroundColor: program.color }} />
                    {program.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ValidationMessage error={errors.programId} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="create-date">{t('create.date')}</FieldLabel>
              <Input id="create-date" type="date" {...form.register('date')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="proto-time">{t('create.startTime')}</FieldLabel>
              <Input id="proto-time" type="time" step={300} {...form.register('startTime')} />
            </Field>
            <Field data-invalid={!!errors.durationMin}>
              <FieldLabel htmlFor="proto-duration">{t('create.duration')}</FieldLabel>
              <Input id="proto-duration" type="number" {...form.register('durationMin', numberInput)} />
              <ValidationMessage error={errors.durationMin} />
            </Field>
            <Field data-invalid={!!errors.capacity}>
              <FieldLabel htmlFor="proto-capacity">{t('create.capacity')}</FieldLabel>
              <Input id="proto-capacity" type="number" {...form.register('capacity', numberInput)} />
              <ValidationMessage error={errors.capacity} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="proto-instructor">{t('create.instructor')}</FieldLabel>
            <Controller
              control={form.control}
              name="instructorId"
              render={({ field }) => (
                <Select
                  value={field.value ?? NO_INSTRUCTOR}
                  onValueChange={(value) => field.onChange(value === NO_INSTRUCTOR ? null : value)}
                >
                  <SelectTrigger id="proto-instructor" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_INSTRUCTOR}>{t('create.instructorNone')}</SelectItem>
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
          <RecurrenceFields form={form} />
          <OccurrencePreview
            occurrences={allOccurrences}
            excluded={excludeDates}
            onToggle={(date) =>
              form.setValue(
                'excludeDates',
                excludeDates.includes(date)
                  ? excludeDates.filter((d) => d !== date)
                  : [...excludeDates, date],
              )
            }
          />
          <Controller
            control={form.control}
            name="publishAt"
            render={({ field, fieldState }) => (
              <PublishAtField
                id="proto-publish"
                value={field.value}
                onChange={field.onChange}
                defaultDate={todayKey(timezone)}
                error={fieldState.error}
              />
            )}
          />
        </FieldGroup>
      </form>
    </EditSheet>
  );
}
