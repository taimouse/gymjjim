'use client';

import { Building2, Plus, Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/components/admin/page-header';
import { ErrorAlert } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type PlatformCenterRow, usePlatformCenters } from '@/features/platform/queries';
import { CENTER_STATUSES } from '@/features/platform/schema';
import { toAppErrorCode } from '@/lib/errors';
import { daysUntil, formatDDay, formatNumber, formatWon } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';

import { CenterCreateSheet } from './center-create-sheet';
import { CenterDrawer } from './center-drawer';
import { CenterStatusBadge } from './status-badges';

/** 센터 목록: 검색(센터명·대표) + 상태 필터 + 상세 드로어(?center=). 상태는 URL 에 남긴다 */
export function CentersView({ today }: { today: string }) {
  const t = useTranslations('platform.centers');
  const tStatus = useTranslations('platform.status');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);

  const query = searchParams.get('q') ?? '';
  const status = CENTER_STATUSES.find((value) => value === searchParams.get('status')) ?? null;
  const centerId = searchParams.get('center');
  const [input, setInput] = useState(query);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || value === 'all') params.delete(key);
        else params.set(key, value);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const debouncedInput = useDebouncedValue(input.trim(), 250);
  useEffect(() => {
    if (debouncedInput !== query) update({ q: debouncedInput || null });
  }, [debouncedInput, query, update]);

  const centers = usePlatformCenters({ query, status });
  const rows = centers.data ?? [];
  const filtered = !!query || !!status;

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            {t('add')}
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <InputGroup className="max-w-md">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
          />
        </InputGroup>
        <ToggleGroup
          type="single"
          value={status ?? 'all'}
          onValueChange={(value) => value && update({ status: value })}
          aria-label={t('filterLabel')}
          className="flex-wrap justify-start gap-2"
        >
          {(['all', ...CENTER_STATUSES] as const).map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              className="h-10 rounded-full border px-4 data-[state=on]:border-primary data-[state=on]:bg-brand-soft data-[state=on]:text-brand-soft-foreground"
            >
              {option === 'all' ? t('all') : tStatus(option)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {centers.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : centers.isError ? (
        <ErrorAlert code={toAppErrorCode(centers.error)} />
      ) : rows.length === 0 ? (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Building2 aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{filtered ? t('empty.searchTitle') : t('empty.title')}</EmptyTitle>
            <EmptyDescription>
              {filtered ? t('empty.searchDescription') : t('empty.description')}
            </EmptyDescription>
          </EmptyHeader>
          {!filtered && (
            <EmptyContent>
              <Button onClick={() => setCreating(true)}>
                <Plus aria-hidden />
                {t('add')}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <CenterTable rows={rows} today={today} onOpen={(id) => update({ center: id })} />
          <p className="mt-4 text-muted-foreground">{t('total', { count: rows.length })}</p>
        </>
      )}

      <CenterDrawer centerId={centerId} today={today} onClose={() => update({ center: null })} />
      {creating && (
        <CenterCreateSheet onClose={() => setCreating(false)} onCreated={(id) => update({ center: id })} />
      )}
    </>
  );
}

function CenterTable({
  rows,
  today,
  onOpen,
}: {
  rows: PlatformCenterRow[];
  today: string;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('platform.centers');

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table className="text-base">
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.center')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('columns.plan')}</TableHead>
            <TableHead className="text-right">{t('columns.members')}</TableHead>
            <TableHead className="text-right">{t('columns.unpaid')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const over = row.max_members !== null && row.member_count >= row.max_members;
            return (
              <TableRow key={row.id} className="h-16 cursor-pointer" onClick={() => onOpen(row.id)}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left font-semibold outline-none focus-visible:underline"
                  >
                    {row.name}
                  </button>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {row.owner_name ?? t('noOwner')}
                    {row.owner_name && !row.owner_linked && (
                      <Badge variant="warning">{t('ownerPending')}</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {row.plan_name ?? <span className="text-muted-foreground">{t('noPlan')}</span>}
                  {row.monthly_price !== null && (
                    <span className="block text-sm text-muted-foreground">
                      {formatWon(row.monthly_price)}
                    </span>
                  )}
                </TableCell>
                <TableCell className={cn('text-right numeric', over && 'font-semibold text-danger')}>
                  {formatNumber(row.member_count)}
                  <span className="text-muted-foreground">
                    {' / '}
                    {row.max_members === null ? t('unlimited') : formatNumber(row.max_members)}
                  </span>
                </TableCell>
                <TableCell className="text-right numeric">
                  {row.unpaid_count > 0 ? (
                    <>
                      <span className={cn('font-semibold', row.overdue_count > 0 && 'text-danger')}>
                        {formatWon(row.unpaid_amount)}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {row.overdue_count > 0
                          ? t('overdueCount', { count: row.overdue_count })
                          : t('unpaidCount', { count: row.unpaid_count })}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-0.5">
                    <CenterStatusBadge status={row.status} />
                    {row.status === 'trial' && row.trial_ends_at && (
                      <span className="text-sm numeric text-muted-foreground">
                        {formatDDay(daysUntil(row.trial_ends_at, today))}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
