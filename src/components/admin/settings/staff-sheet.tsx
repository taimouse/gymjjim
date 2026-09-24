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
import { ErrorAlert, useErrorText, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { inviteStaff, removeStaff, updateStaff } from '@/features/staff/actions';
import { staffKeys, type StaffItem } from '@/features/staff/queries';
import { STAFF_COLORS, staffInviteSchema, type StaffInviteValues } from '@/features/staff/schema';
import type { AppErrorCode } from '@/lib/errors';
import { formatPhone } from '@/lib/format';

/** 직원 초대(새로 만들기) 또는 정보·권한 변경 드로어 (대표 전용) */
export function StaffSheet({ staff, onClose }: { staff: StaffItem | null; onClose: () => void }) {
  const t = useTranslations('settings.staff');
  const tRole = useTranslations('admin.topbar.role');
  const tCommon = useTranslations('common');
  const errorText = useErrorText();
  const { centerId, staffId } = useAdmin();
  const queryClient = useQueryClient();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<StaffInviteValues>({
    resolver: zodResolver(staffInviteSchema),
    defaultValues: {
      name: staff?.name ?? '',
      email: staff?.email ?? '',
      phone: formatPhone(staff?.phone),
      role: staff?.role ?? 'staff',
      color: staff?.color ?? STAFF_COLORS[1],
    },
  });
  const { errors } = form.formState;
  const refresh = () => queryClient.invalidateQueries({ queryKey: staffKeys.list(centerId) });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      if (staff) {
        const result = await updateStaff({ id: staff.id, ...values });
        if (!result.ok) return setError(result.code);
        toast.success(t('updated'));
      } else {
        const result = await inviteStaff(values);
        if (!result.ok) return setError(result.code);
        toast.success(result.data.existing ? t('linkedExisting') : t('invited'));
      }
      await refresh();
      onClose();
    });
  });

  const onRemove = () => {
    if (!staff) return;
    startTransition(async () => {
      const result = await removeStaff(staff.id);
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await refresh();
      toast.success(t('removed'));
      setConfirmRemove(false);
      onClose();
    });
  };

  return (
    <EditSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={staff ? t('editTitle') : t('inviteTitle')}
      description={staff ? undefined : t('inviteDescription')}
      footer={
        <>
          {staff && staff.id !== staffId ? (
            <Button
              type="button"
              variant="ghost"
              className="text-danger"
              onClick={() => setConfirmRemove(true)}
            >
              <Trash2 aria-hidden />
              {t('remove')}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" form="staff-form" disabled={pending}>
            {pending && <Spinner />}
            {staff ? tCommon('save') : t('invite')}
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="staff-name">{t('name')}</FieldLabel>
            <Input id="staff-name" {...form.register('name')} />
            <ValidationMessage error={errors.name} />
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="staff-email">{t('email')}</FieldLabel>
            <Input
              id="staff-email"
              type="email"
              inputMode="email"
              disabled={!!staff}
              {...form.register('email')}
            />
            <ValidationMessage error={errors.email} />
          </Field>
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="staff-phone">{t('phone')}</FieldLabel>
            <Input id="staff-phone" type="tel" inputMode="tel" {...form.register('phone')} />
            <ValidationMessage error={errors.phone} />
          </Field>
          <Field>
            <FieldLabel>{t('role')}</FieldLabel>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-6">
                  {(['staff', 'owner'] as const).map((role) => (
                    <label key={role} className="flex min-h-11 cursor-pointer items-center gap-2">
                      <RadioGroupItem value={role} />
                      {tRole(role)}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
          </Field>
          <Field>
            <FieldLabel>{t('color')}</FieldLabel>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <ColorPicker
                  value={field.value}
                  onChange={field.onChange}
                  colors={STAFF_COLORS}
                  label={t('color')}
                />
              )}
            />
          </Field>
        </FieldGroup>
        <ErrorAlert code={error} />
      </form>
      {staff && (
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title={t('removeConfirm.title', { name: staff.name })}
          description={t('removeConfirm.description')}
          confirmLabel={tCommon('delete')}
          onConfirm={onRemove}
          pending={pending}
        />
      )}
    </EditSheet>
  );
}
