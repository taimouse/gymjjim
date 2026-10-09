'use client';

import { Plus, Tags } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { PageHeader } from '@/components/admin/page-header';
import { ErrorAlert } from '@/components/form-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type PlanRow, usePlans } from '@/features/platform/queries';
import { toAppErrorCode } from '@/lib/errors';
import { formatNumber, formatWon } from '@/lib/format';

import { PlanSheet } from './plan-sheet';

/** 요금제 목록. 행을 누르면 수정 드로어 */
export function PlansView() {
  const t = useTranslations('platform.plans');
  const plans = usePlans();
  const [editing, setEditing] = useState<{ plan: PlanRow | null } | null>(null);
  const rows = plans.data ?? [];
  const limit = (value: number | null) => (value === null ? t('unlimited') : formatNumber(value));

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setEditing({ plan: null })}>
            <Plus aria-hidden />
            {t('add')}
          </Button>
        }
      />

      {plans.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : plans.isError ? (
        <ErrorAlert code={toAppErrorCode(plans.error)} />
      ) : rows.length === 0 ? (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Tags aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table className="text-base">
            <TableHeader>
              <TableRow>
                <TableHead>{t('name')}</TableHead>
                <TableHead className="text-right">{t('monthlyPrice')}</TableHead>
                <TableHead className="text-right">{t('maxMembers')}</TableHead>
                <TableHead className="text-right">{t('maxStaff')}</TableHead>
                <TableHead>{t('state')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((plan) => (
                <TableRow key={plan.id} className="h-14 cursor-pointer" onClick={() => setEditing({ plan })}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-semibold outline-none focus-visible:underline"
                    >
                      {plan.name}
                    </button>
                    <span className="block font-mono text-sm text-muted-foreground">{plan.code}</span>
                  </TableCell>
                  <TableCell className="text-right font-semibold numeric">
                    {formatWon(plan.monthly_price)}
                  </TableCell>
                  <TableCell className="text-right numeric">{limit(plan.max_members)}</TableCell>
                  <TableCell className="text-right numeric">{limit(plan.max_staff)}</TableCell>
                  <TableCell>
                    <Badge variant={plan.is_active ? 'success' : 'muted'}>
                      {plan.is_active ? t('active') : t('inactive')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <PlanSheet
          plan={editing.plan}
          nextSortOrder={rows.reduce((max, plan) => Math.max(max, plan.sort_order), 0) + 1}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
