'use client';

import { useQueryClient } from '@tanstack/react-query';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { createHoldInput } from '@/features/booking/schema';
import { holdPass } from '@/features/members/actions';
import { memberKeys, type MemberPassRow } from '@/features/members/queries';
import type { AppErrorCode } from '@/lib/errors';
import { addDaysToKey, formatDateKey, todayKey } from '@/lib/format';

/** 정지 등록: 기간 선택 → 연장될 만료일 미리보기 → 확정 */
export function HoldDialog({ pass, onClose }: { pass: MemberPassRow; onClose: () => void }) {
  const t = useTranslations('members.hold');
  const tCommon = useTranslations('common');
  const { timezone } = useAdmin();
  const queryClient = useQueryClient();
  const today = todayKey(timezone);
  const [startDate, setStartDate] = useState(today > pass.start_date ? today : pass.start_date);
  const [endDate, setEndDate] = useState(startDate);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) && /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= startDate;
  const days = valid ? differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1 : 0;
  const newEnd = valid && pass.end_date ? addDaysToKey(pass.end_date, days) : null;

  const submit = () => {
    const parsed = createHoldInput.safeParse({
      memberPassId: pass.id,
      startDate,
      endDate,
      reason: reason || undefined,
    });
    if (!parsed.success) {
      setError('INVALID_DATE_RANGE');
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await holdPass(parsed.data);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: memberKeys.all });
      toast.success(t('done'));
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t('pass')}</FieldLabel>
            <p className="font-medium">{pass.name}</p>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="hold-start">{t('start')}</FieldLabel>
              <Input
                id="hold-start"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="hold-end">{t('end')}</FieldLabel>
              <Input
                id="hold-end"
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="hold-reason">{t('reason')}</FieldLabel>
            <Input
              id="hold-reason"
              placeholder={t('reasonPlaceholder')}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {valid && (
            <p className="rounded-xl bg-info-soft p-4 font-medium text-info-soft-foreground" role="status">
              {newEnd && pass.end_date
                ? t('preview', {
                    from: formatDateKey(pass.end_date, { year: true }),
                    to: formatDateKey(newEnd, { year: true }),
                    days,
                  })
                : t('previewNoExpiry', { days })}
            </p>
          )}
          <ErrorAlert code={error} />
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || !valid}>
            {pending && <Spinner />}
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
