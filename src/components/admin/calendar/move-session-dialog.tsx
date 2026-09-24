'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { useErrorText } from '@/components/form-messages';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldDescription } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { moveSession } from '@/features/sessions/actions';
import { sessionKeys } from '@/features/sessions/queries';
import { type EditScope, SCOPES } from '@/features/sessions/schema';
import { formatDateTime } from '@/lib/format';

import type { MoveRequest } from './admin-calendar';

/** 드래그로 시간 이동 확인: "예약자에게 알림 보내기" + 반복 수업이면 적용 범위 */
export function MoveSessionDialog({ request, onDone }: { request: MoveRequest; onDone: () => void }) {
  const t = useTranslations('calendar');
  const errorText = useErrorText();
  const { timezone } = useAdmin();
  const queryClient = useQueryClient();
  const { session } = request;
  const people = session.booked_count + session.waitlist_count;
  const [notify, setNotify] = useState(people > 0);
  const [scope, setScope] = useState<EditScope>('this');
  const [pending, startTransition] = useTransition();

  const cancel = () => {
    request.revert();
    onDone();
  };

  const confirm = () =>
    startTransition(async () => {
      const result = await moveSession({
        sessionId: session.id,
        scope,
        startsAt: request.startsAt,
        endsAt: request.endsAt,
        notify,
      });
      if (!result.ok) {
        request.revert();
        toast.error(errorText(result.code));
        onDone();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      toast.success(
        result.data.notified > 0 ? t('move.notified', { count: result.data.notified }) : t('move.done'),
      );
      onDone();
    });

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => !open && cancel()}
      title={t('move.title')}
      description={t('move.description', {
        from: formatDateTime(session.starts_at, timezone),
        to: formatDateTime(request.startsAt, timezone),
      })}
      confirmLabel={t('move.confirm')}
      destructive={false}
      onConfirm={confirm}
      pending={pending}
    >
      <div className="space-y-3">
        {session.recurrence_group_id && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{t('scope.label')}</p>
            <RadioGroup
              value={scope}
              onValueChange={(value) => setScope(value as EditScope)}
              className="flex gap-6"
            >
              {SCOPES.map((item) => (
                <label key={item} className="flex min-h-11 cursor-pointer items-center gap-2">
                  <RadioGroupItem value={item} />
                  {t(`scope.${item}`)}
                </label>
              ))}
            </RadioGroup>
          </div>
        )}
        {people > 0 && (
          <div>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
              <Checkbox checked={notify} onCheckedChange={(value) => setNotify(value === true)} />
              {t('move.notify')}
            </label>
            <FieldDescription>{t('move.notifyHint', { count: people })}</FieldDescription>
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}
