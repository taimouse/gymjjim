'use client';

import { Inbox } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  LOG_STATUS_FILTERS,
  type LogStatusFilter,
  type NotificationLogRow,
  useNotificationLogs,
} from '@/features/notifications/queries';
import { isNotificationType } from '@/features/notifications/templates';
import messages from '@/i18n/messages/ko.json';
import { toAppErrorCode } from '@/lib/errors';
import { formatDateTime, maskPhone } from '@/lib/format';

const STATUS_TONE = {
  pending: 'info',
  sending: 'info',
  sent: 'success',
  failed: 'danger',
  skipped: 'muted',
} as const satisfies Record<NotificationLogRow['status'], 'info' | 'success' | 'danger' | 'muted'>;

type ReasonKey = keyof typeof messages.notifications.reasons;
const isReason = (value: string): value is ReasonKey => Object.hasOwn(messages.notifications.reasons, value);

/** 최근 발송 내역 50건 (상태별 보기) */
export function NotificationLogs() {
  const t = useTranslations('settings.notifications.logs');
  const tStatus = useTranslations('notifications.status');
  const { centerId } = useAdmin();
  const [status, setStatus] = useState<LogStatusFilter>('all');
  const logs = useNotificationLogs(centerId, status);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleGroup
          type="single"
          value={status}
          onValueChange={(value) => {
            const next = LOG_STATUS_FILTERS.find((option) => option === value);
            if (next) setStatus(next);
          }}
          aria-label={t('filterLabel')}
          className="flex-wrap justify-start gap-2"
        >
          {LOG_STATUS_FILTERS.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              className="h-10 rounded-full border px-4 data-[state=on]:border-primary data-[state=on]:bg-brand-soft data-[state=on]:text-brand-soft-foreground"
            >
              {option === 'all' ? t('all') : tStatus(option)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {logs.isPending ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : logs.isError ? (
          <ErrorAlert code={toAppErrorCode(logs.error)} />
        ) : logs.data.length === 0 ? (
          <Empty className="border py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t('empty')}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table className="min-w-[48rem] text-base">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('time')}</TableHead>
                  <TableHead>{t('member')}</TableHead>
                  <TableHead>{t('type')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('note')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.data.map((row) => (
                  <LogRow key={row.id} row={row} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogRow({ row }: { row: NotificationLogRow }) {
  const t = useTranslations('settings.notifications.logs');
  const tType = useTranslations('notifications.types');
  const tStatus = useTranslations('notifications.status');
  const tReason = useTranslations('notifications.reasons');
  const { timezone } = useAdmin();
  const notes = [
    row.provider === 'mock' && row.status === 'sent' ? t('mock') : null,
    row.fallback_used ? t('fallback') : null,
    row.status === 'pending' && row.scheduled_at
      ? t('scheduled', { time: formatDateTime(row.scheduled_at, timezone) })
      : null,
    row.error ? (isReason(row.error) ? tReason(row.error) : row.error) : null,
    row.attempts > 1 ? t('attempts', { count: row.attempts }) : null,
  ].filter((note): note is string => !!note);

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatDateTime(row.sent_at ?? row.created_at, timezone)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {row.member ? (
          <>
            {row.member.name}
            <span className="ml-2 text-sm text-muted-foreground">{maskPhone(row.member.phone)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{t('unknownMember')}</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {isNotificationType(row.type) ? tType(row.type) : row.type}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_TONE[row.status]}>{tStatus(row.status)}</Badge>
      </TableCell>
      <TableCell className="max-w-80 text-sm text-muted-foreground">
        <span className="line-clamp-2 whitespace-normal">{notes.join(' · ')}</span>
      </TableCell>
    </TableRow>
  );
}
