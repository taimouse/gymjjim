'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { useErrorText } from '@/components/form-messages';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cancelSessionAction } from '@/features/booking/actions';
import { memberKeys } from '@/features/members/queries';
import { sessionKeys } from '@/features/sessions/queries';

/** 폐강 확인창 (되돌릴 수 없음): 전체 취소 + 복구 + 알림 */
export function CancelSessionDialog({
  sessionId,
  affected,
  onClose,
  onDone,
}: {
  sessionId: string;
  affected: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('calendar.cancelSession');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await cancelSessionAction({ sessionId, reason: reason.trim() || undefined });
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
        queryClient.invalidateQueries({ queryKey: memberKeys.all }),
      ]);
      toast.success(t('done', { count: result.data.affected.length }));
      onDone();
    });

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={t('description', { count: affected })}
      confirmLabel={t('confirm')}
      onConfirm={confirm}
      pending={pending}
    >
      <Field>
        <FieldLabel htmlFor="cancel-reason">{t('reason')}</FieldLabel>
        <Input
          id="cancel-reason"
          value={reason}
          maxLength={200}
          placeholder={t('reasonPlaceholder')}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </ConfirmDialog>
  );
}
