'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { useErrorText } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { updateMemberMemo } from '@/features/members/actions';
import { type MemberDetail, memberKeys } from '@/features/members/queries';
import { formatDateKey, formatDateTime, formatWon } from '@/lib/format';
import { computePassState, passDaysLeft } from '@/lib/pass-status';

import { PassStatusBadge } from './pass-status-badge';

const BOOKING_TONE = {
  booked: 'brand',
  waitlisted: 'info',
  attended: 'success',
  no_show: 'danger',
  late_cancelled: 'warning',
  cancelled: 'muted',
} as const;

/** 회원 드로어 탭: 예약 이력 / 이용권 이력 / 메모 */
export function MemberHistory({ detail, today }: { detail: MemberDetail; today: string }) {
  const t = useTranslations('members');
  const tCommon = useTranslations('common');
  const errorText = useErrorText();
  const { timezone } = useAdmin();
  const queryClient = useQueryClient();
  const [memo, setMemo] = useState(detail.member.memo ?? '');
  const [pending, startTransition] = useTransition();

  const saveMemo = () =>
    startTransition(async () => {
      const result = await updateMemberMemo(detail.member.id, memo);
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: memberKeys.detail(detail.member.id) });
      toast.success(t('drawer.memoSaved'));
    });

  return (
    <Tabs defaultValue="bookings" className="gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="bookings">{t('drawer.tabs.bookings')}</TabsTrigger>
        <TabsTrigger value="passes">{t('drawer.tabs.passes')}</TabsTrigger>
        <TabsTrigger value="memo">{t('drawer.tabs.memo')}</TabsTrigger>
      </TabsList>

      <TabsContent value="bookings">
        <p className="mb-3 text-sm text-muted-foreground">
          {t('drawer.stats', {
            attended: detail.stats.attended,
            noShow: detail.stats.no_show,
            late: detail.stats.late_cancelled,
          })}
        </p>
        {detail.bookings.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t('drawer.bookingsEmpty')}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {detail.bookings.map((booking) => (
              <li key={booking.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: booking.session?.program?.color ?? 'var(--muted)' }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{booking.session?.program?.name}</span>
                  <span className="block text-sm text-muted-foreground">
                    {booking.session ? formatDateTime(booking.session.starts_at, timezone) : ''}
                  </span>
                </span>
                <Badge variant={BOOKING_TONE[booking.status]}>{t(`bookingStatus.${booking.status}`)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="passes">
        {detail.passes.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t('drawer.passesEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {detail.passes.map((pass) => {
              const state = computePassState(pass, today);
              return (
                <li key={pass.id} className="space-y-1.5 rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{pass.name}</span>
                    <PassStatusBadge
                      state={state}
                      remaining={pass.remaining_count}
                      daysLeft={passDaysLeft(pass, today)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {pass.end_date
                      ? t('pass.period', {
                          start: formatDateKey(pass.start_date, { year: true }),
                          end: formatDateKey(pass.end_date, { year: true }),
                        })
                      : t('pass.startsOn', { date: formatDateKey(pass.start_date, { year: true }) })}
                    {' · '}
                    {t('drawer.paid', { amount: formatWon(pass.paid_amount) })}
                  </p>
                  {pass.holds.map((hold) => (
                    <p key={hold.id} className="text-sm text-info-soft-foreground">
                      {t('drawer.holdsTitle', {
                        start: formatDateKey(hold.start_date),
                        end: formatDateKey(hold.end_date),
                      })}
                      {hold.reason ? ` · ${hold.reason}` : ''}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="memo" className="space-y-3">
        <Textarea
          rows={6}
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder={t('drawer.memoPlaceholder')}
        />
        <div className="flex justify-end">
          <Button onClick={saveMemo} disabled={pending || memo === (detail.member.memo ?? '')}>
            {pending && <Spinner />}
            {tCommon('save')}
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
