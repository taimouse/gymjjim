'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CalendarX2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useErrorText } from '@/components/form-messages';
import { useMember } from '@/components/member/member-context';
import { QueryError } from '@/components/member/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { bookManyAction } from '@/features/booking/actions';
import { memberBookingKeys, type RepeatCandidate, useRepeatCandidates } from '@/features/booking/queries';
import { formatDate, formatTimeRange } from '@/lib/format';
import { remainingSeats } from '@/lib/session-status';

/** "지난주와 같은 수업": 예약 가능한 수업만 체크된 상태로 보여주고 확인 후 일괄 예약 */
export function RepeatSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('member.repeat');
  const errorText = useErrorText();
  const { centerId } = useMember();
  const queryClient = useQueryClient();
  const candidates = useRepeatCandidates(centerId, open);
  // 기본은 전부 체크. 사용자가 끈 것만 기억한다
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const rows = [...(candidates.data ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const selected = rows.filter((row) => row.bookable && !unchecked.has(row.session_id));

  const toggle = (sessionId: string, checked: boolean) =>
    setUnchecked((previous) => {
      const next = new Set(previous);
      if (checked) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });

  const submit = () =>
    startTransition(async () => {
      const response = await bookManyAction(selected.map((row) => row.session_id));
      await queryClient.invalidateQueries({ queryKey: memberBookingKeys.all });
      if (!response.ok) {
        toast.error(errorText(response.code));
        return;
      }
      const failures = response.data.flatMap(({ result }) => (result.ok ? [] : [result.code]));
      const booked = response.data.length - failures.length;
      if (failures.length === 0) toast.success(t('done', { count: booked }));
      else
        toast.warning(t('result', { ok: booked, failed: failures.length }), {
          description: errorText(failures[0]!),
        });
      onOpenChange(false);
    });

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      onAnimationEnd={(opened) => !opened && setUnchecked(new Set())}
    >
      <DrawerContent className="mx-auto max-w-md text-base">
        <DrawerHeader>
          <DrawerTitle className="text-xl font-bold">{t('title')}</DrawerTitle>
          <DrawerDescription className="text-base">{t('description')}</DrawerDescription>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-2">
          {candidates.isPending ? (
            <div className="space-y-2" aria-hidden>
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : candidates.isError ? (
            <QueryError error={candidates.error} onRetry={() => void candidates.refetch()} />
          ) : rows.length === 0 ? (
            <Empty className="border py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarX2 aria-hidden />
                </EmptyMedia>
                <EmptyTitle className="text-base">{t('empty')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li key={row.session_id}>
                  <CandidateRow
                    row={row}
                    checked={row.bookable && !unchecked.has(row.session_id)}
                    onCheckedChange={(checked) => toggle(row.session_id, checked)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <DrawerFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button
            size="lg"
            className="h-14 text-lg"
            onClick={submit}
            disabled={pending || selected.length === 0}
          >
            {pending && <Spinner />}
            {selected.length === 0 ? t('selectHint') : t('submit', { count: selected.length })}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function CandidateRow({
  row,
  checked,
  onCheckedChange,
}: {
  row: RepeatCandidate;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const t = useTranslations('member');
  const { timezone } = useMember();
  const full = remainingSeats(row) === 0;
  return (
    <label
      className={
        'flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 has-data-checked:border-primary has-data-checked:bg-brand-soft/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'
      }
    >
      <Checkbox
        className="size-6"
        checked={checked}
        disabled={!row.bookable}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{row.program_name}</span>
        <span className="block text-sm text-muted-foreground">
          {formatDate(row.starts_at, timezone)} {formatTimeRange(row.starts_at, row.ends_at, timezone)}
        </span>
        {row.bookable && full && <span className="block text-sm text-info">{t('repeat.willWaitlist')}</span>}
      </span>
      {row.bookable ? (
        <Badge variant={full ? 'info' : 'success'} className="h-7">
          {full
            ? t('book.waitlistPeople', { count: row.waitlist_count })
            : t('book.seatsLeft', { count: remainingSeats(row) })}
        </Badge>
      ) : (
        <Badge variant="muted" className="h-7">
          {t('repeat.notBookable')}
        </Badge>
      )}
    </label>
  );
}
