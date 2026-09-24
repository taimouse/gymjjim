'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { EditSheet } from '@/components/admin/edit-sheet';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { updateSession } from '@/features/sessions/actions';
import { type CalendarSession, sessionKeys } from '@/features/sessions/queries';
import { SCOPES, sessionUpdateSchema, type SessionUpdateValues } from '@/features/sessions/schema';
import { useStaffQuery } from '@/features/staff/queries';
import type { AppErrorCode } from '@/lib/errors';
import { numberInput } from '@/lib/form';
import { toDateKey, toTimeKey } from '@/lib/format';

const NO_INSTRUCTOR = 'none';

/** 수업 수정: 시간·강사·정원·메모. 반복 수업이면 "이 수업만 / 이후 전체" 선택 */
export function SessionEditSheet({ session, onClose }: { session: CalendarSession; onClose: () => void }) {
  const t = useTranslations('calendar');
  const tCommon = useTranslations('common');
  const { centerId, timezone } = useAdmin();
  const queryClient = useQueryClient();
  const staff = useStaffQuery(centerId);
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<SessionUpdateValues>({
    resolver: zodResolver(sessionUpdateSchema),
    defaultValues: {
      sessionId: session.id,
      scope: 'this',
      date: toDateKey(session.starts_at, timezone),
      startTime: toTimeKey(session.starts_at, timezone),
      durationMin: Math.round((Date.parse(session.ends_at) - Date.parse(session.starts_at)) / 60_000),
      instructorId: session.instructor?.id ?? null,
      capacity: session.capacity,
      note: session.note ?? '',
      notify: session.booked_count + session.waitlist_count > 0,
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await updateSession(values);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      toast.success(t('edit.done', { count: result.data.updated }));
      onClose();
    });
  });

  return (
    <EditSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('edit.title')}
      description={session.program?.name}
      footer={
        <>
          <span />
          <Button type="submit" form="session-edit-form" disabled={pending}>
            {pending && <Spinner />}
            {tCommon('save')}
          </Button>
        </>
      }
    >
      <form id="session-edit-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <FieldGroup>
          {session.recurrence_group_id && (
            <Field>
              <FieldLabel>{t('scope.label')}</FieldLabel>
              <Controller
                control={form.control}
                name="scope"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
                    {SCOPES.map((scope) => (
                      <label key={scope} className="flex min-h-11 cursor-pointer items-center gap-2">
                        <RadioGroupItem value={scope} />
                        {t(`scope.${scope}`)}
                      </label>
                    ))}
                  </RadioGroup>
                )}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.date}>
              <FieldLabel htmlFor="edit-date">{t('create.date')}</FieldLabel>
              <Input id="edit-date" type="date" {...form.register('date')} />
              <ValidationMessage error={errors.date} />
            </Field>
            <Field data-invalid={!!errors.startTime}>
              <FieldLabel htmlFor="edit-time">{t('create.startTime')}</FieldLabel>
              <Input id="edit-time" type="time" step={300} {...form.register('startTime')} />
              <ValidationMessage error={errors.startTime} />
            </Field>
            <Field data-invalid={!!errors.durationMin}>
              <FieldLabel htmlFor="edit-duration">{t('create.duration')}</FieldLabel>
              <Input
                id="edit-duration"
                type="number"
                inputMode="numeric"
                {...form.register('durationMin', numberInput)}
              />
              <ValidationMessage error={errors.durationMin} />
            </Field>
            <Field data-invalid={!!errors.capacity}>
              <FieldLabel htmlFor="edit-capacity">{t('create.capacity')}</FieldLabel>
              <Input
                id="edit-capacity"
                type="number"
                inputMode="numeric"
                {...form.register('capacity', numberInput)}
              />
              <ValidationMessage error={errors.capacity} />
            </Field>
          </div>
          <Field>
            <FieldLabel>{t('create.instructor')}</FieldLabel>
            <Controller
              control={form.control}
              name="instructorId"
              render={({ field }) => (
                <Select
                  value={field.value ?? NO_INSTRUCTOR}
                  onValueChange={(value) => field.onChange(value === NO_INSTRUCTOR ? null : value)}
                >
                  <SelectTrigger className="w-full">
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
          <Field>
            <FieldLabel htmlFor="edit-note">{t('create.note')}</FieldLabel>
            <Textarea id="edit-note" rows={2} {...form.register('note')} />
          </Field>
          <Controller
            control={form.control}
            name="notify"
            render={({ field }) => (
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox checked={field.value} onCheckedChange={(value) => field.onChange(value === true)} />
                {t('edit.notify')}
              </label>
            )}
          />
        </FieldGroup>
        <ErrorAlert code={error} />
      </form>
    </EditSheet>
  );
}
