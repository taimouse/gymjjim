'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { EditSheet } from '@/components/admin/edit-sheet';
import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { createMember, updateMember } from '@/features/members/actions';
import { memberKeys } from '@/features/members/queries';
import {
  memberCreateSchema,
  type MemberFormInput,
  type MemberFormOutput,
  memberFormSchema,
} from '@/features/members/schema';
import type { AppErrorCode } from '@/lib/errors';

const NO_GENDER = 'none';

/** 회원 등록·수정 드로어. 등록은 이름 + 전화번호 + 개인정보 동의(현장 확인)만 필수 */
export function MemberFormSheet({
  memberId,
  initialValues,
  onClose,
  onCreated,
}: {
  memberId?: string;
  initialValues: MemberFormInput;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations('members.form');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const isNew = !memberId;
  const form = useForm<MemberFormInput, unknown, MemberFormOutput>({
    resolver: zodResolver(isNew ? memberCreateSchema : memberFormSchema),
    defaultValues: initialValues,
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setError(null);
    const raw = form.getValues();
    startTransition(async () => {
      const result = memberId ? await updateMember(memberId, raw) : await createMember(raw);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: memberKeys.all });
      toast.success(isNew ? t('created') : t('updated'));
      onClose();
      if (result.data && 'id' in result.data) onCreated?.(result.data.id);
    });
  });

  return (
    <EditSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isNew ? t('createTitle') : t('editTitle')}
      footer={
        <>
          <span />
          <Button type="submit" form="member-form" disabled={pending}>
            {pending && <Spinner />}
            {tCommon('save')}
          </Button>
        </>
      }
    >
      <form id="member-form" onSubmit={onSubmit} noValidate className="space-y-6">
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="member-name">{t('name')}</FieldLabel>
            <Input id="member-name" autoComplete="off" {...form.register('name')} />
            <ValidationMessage error={errors.name} />
          </Field>
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="member-phone">{t('phone')}</FieldLabel>
            <Input
              id="member-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder={t('phonePlaceholder')}
              {...form.register('phone')}
            />
            <ValidationMessage error={errors.phone} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field data-invalid={!!errors.birth}>
              <FieldLabel htmlFor="member-birth">{t('birth')}</FieldLabel>
              <Input id="member-birth" type="date" {...form.register('birth')} />
              <ValidationMessage error={errors.birth} />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-gender">{t('gender')}</FieldLabel>
              <Controller
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <Select
                    value={field.value ?? NO_GENDER}
                    onValueChange={(value) => field.onChange(value === NO_GENDER ? null : value)}
                  >
                    <SelectTrigger id="member-gender" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_GENDER}>{t('genderNone')}</SelectItem>
                      {(['male', 'female', 'other'] as const).map((gender) => (
                        <SelectItem key={gender} value={gender}>
                          {t(`genders.${gender}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="member-tags">{t('tags')}</FieldLabel>
            <Input id="member-tags" placeholder={t('tagsPlaceholder')} {...form.register('tags')} />
          </Field>
          <Field>
            <FieldLabel htmlFor="member-memo">{t('memo')}</FieldLabel>
            <Textarea id="member-memo" rows={3} {...form.register('memo')} />
          </Field>
          {isNew && (
            <Controller
              control={form.control}
              name="privacyAgreed"
              render={({ field, fieldState }) => (
                <div className="space-y-1 rounded-lg bg-muted p-3">
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                      className="size-5"
                    />
                    {t('privacy')}
                  </label>
                  <FieldDescription>{t('privacyHint')}</FieldDescription>
                  <ValidationMessage error={fieldState.error} />
                </div>
              )}
            />
          )}
          <Controller
            control={form.control}
            name="marketingAgreed"
            render={({ field }) => (
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="size-5"
                />
                {t('marketing')}
              </label>
            )}
          />
          <Controller
            control={form.control}
            name="notifyEnabled"
            render={({ field }) => (
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                {t('notify')}
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />
        </FieldGroup>
        <ErrorAlert code={error} />
      </form>
    </EditSheet>
  );
}
