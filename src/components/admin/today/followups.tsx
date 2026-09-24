'use client';

import { useQueryClient } from '@tanstack/react-query';
import { TicketPlus, UserRoundCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { GrantPassDialog } from '@/components/admin/members/grant-pass-dialog';
import { useMemberDrawer } from '@/components/admin/members/use-member-drawer';
import { ErrorAlert } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  dashboardKeys,
  FOLLOWUP_REASONS,
  type FollowupReason,
  type FollowupRow,
  useFollowups,
} from '@/features/dashboard/queries';
import { toAppErrorCode } from '@/lib/errors';
import { formatDate, formatDDay, maskPhone } from '@/lib/format';

const EMPTY_KEY = {
  expiring: 'emptyExpiring',
  low: 'emptyLow',
  inactive: 'emptyInactive',
} as const satisfies Record<FollowupReason, string>;

/** 챙겨야 할 회원: 만료 D-7 이내 / 잔여 1~2회 / 최근 2주 미출석 → 회원 드로어 · 이용권 부여 */
export function Followups() {
  const t = useTranslations('today.followups');
  const { centerId } = useAdmin();
  const queryClient = useQueryClient();
  const drawer = useMemberDrawer();
  const followups = useFollowups(centerId);
  const [reason, setReason] = useState<FollowupReason>('expiring');
  const [grantingId, setGrantingId] = useState<string | null>(null);

  const rows = followups.data ?? [];
  const list = rows.filter((row) => row.reason === reason);
  const count = (value: FollowupReason) => rows.filter((row) => row.reason === value).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ToggleGroup
          type="single"
          value={reason}
          onValueChange={(value) => {
            const next = FOLLOWUP_REASONS.find((option) => option === value);
            if (next) setReason(next);
          }}
          aria-label={t('title')}
          className="grid w-full grid-cols-3 gap-2"
        >
          {FOLLOWUP_REASONS.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              className="h-11 rounded-lg border px-2 data-[state=on]:border-primary data-[state=on]:bg-brand-soft data-[state=on]:text-brand-soft-foreground"
            >
              {t(option)}
              {followups.data && <span className="font-bold numeric">{count(option)}</span>}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {followups.isPending ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : followups.isError ? (
          <ErrorAlert code={toAppErrorCode(followups.error)} />
        ) : list.length === 0 ? (
          <Empty className="border py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserRoundCheck aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t(EMPTY_KEY[reason])}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {list.map((row) => (
              <FollowupItem
                key={`${row.reason}-${row.member_id}`}
                row={row}
                onOpen={() => drawer.open(row.member_id)}
                onGrant={() => setGrantingId(row.member_id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
      {grantingId && (
        <GrantPassDialog
          memberId={grantingId}
          onClose={() => {
            setGrantingId(null);
            void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
          }}
        />
      )}
    </Card>
  );
}

function FollowupItem({
  row,
  onOpen,
  onGrant,
}: {
  row: FollowupRow;
  onOpen: () => void;
  onGrant: () => void;
}) {
  const t = useTranslations('today.followups');
  const { timezone } = useAdmin();
  const detail =
    row.reason === 'expiring'
      ? t('expiresIn', { dday: formatDDay(row.days_left ?? 0) })
      : row.reason === 'low'
        ? t('remaining', { count: row.remaining ?? 0 })
        : row.last_attended_at
          ? t('lastAttended', { date: formatDate(row.last_attended_at, timezone) })
          : t('neverAttended');

  return (
    <li className="flex items-center gap-3 py-2.5">
      <button
        type="button"
        onClick={onOpen}
        className="min-h-11 min-w-0 flex-1 rounded-lg px-1 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="block truncate">
          <span className="font-semibold">{row.name}</span>
          <span className="ml-2 text-sm text-muted-foreground">{maskPhone(row.phone)}</span>
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          <span
            className={row.reason === 'inactive' ? undefined : 'font-semibold text-warning-soft-foreground'}
          >
            {detail}
          </span>
          {row.pass_name && ` · ${row.pass_name}`}
        </span>
      </button>
      <Button variant="outline" onClick={onGrant} className="shrink-0">
        <TicketPlus aria-hidden />
        {t('grant')}
      </Button>
    </li>
  );
}
