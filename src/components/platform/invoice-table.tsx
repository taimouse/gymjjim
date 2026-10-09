'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { useErrorText } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { setInvoiceStatus } from '@/features/platform/actions';
import { type InvoiceRow, platformKeys } from '@/features/platform/queries';
import type { InvoiceStatus } from '@/features/platform/schema';
import { formatDateKey, formatDateWithYear, formatMonthKey, formatWon } from '@/lib/format';

import { InvoiceStatusBadge } from './status-badges';

/**
 * 청구서 표. 입금 확인은 확인창 없이 바로 하고 "되돌리기" 토스트를 띄운다.
 * 청구 취소만 확인창 (취소하면 같은 달 청구서를 새로 발행할 수 있게 된다).
 */
export function InvoiceTable({
  rows,
  today,
  showCenter = true,
  onOpenCenter,
}: {
  rows: InvoiceRow[];
  today: string;
  showCenter?: boolean;
  onOpenCenter?: (centerId: string) => void;
}) {
  const t = useTranslations('platform.invoices');
  const tCommon = useTranslations('common');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [voiding, setVoiding] = useState<InvoiceRow | null>(null);

  const change = (
    invoice: InvoiceRow,
    status: InvoiceStatus,
    options: { paidAt?: string | null; undoable?: boolean; onDone?: () => void } = {},
  ) => {
    startTransition(async () => {
      const result = await setInvoiceStatus({ id: invoice.id, status, paidAt: options.paidAt ?? null });
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: platformKeys.all });
      options.onDone?.();
      const { previousStatus, previousPaidAt } = result.data;
      toast.success(t(`changed.${status}`, { name: invoice.center?.name ?? '' }), {
        action:
          options.undoable === false
            ? undefined
            : {
                label: tCommon('undo'),
                onClick: () => change(invoice, previousStatus, { paidAt: previousPaidAt, undoable: false }),
              },
      });
    });
  };

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table className="text-base">
        <TableHeader>
          <TableRow>
            {showCenter && <TableHead>{t('columns.center')}</TableHead>}
            <TableHead>{t('columns.period')}</TableHead>
            <TableHead className="text-right">{t('columns.amount')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('columns.dueDate')}</TableHead>
            <TableHead>{t('columns.status')}</TableHead>
            <TableHead className="w-0">
              <span className="sr-only">{t('columns.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((invoice) => (
            <TableRow key={invoice.id} className="h-14">
              {showCenter && (
                <TableCell>
                  <button
                    type="button"
                    onClick={() => onOpenCenter?.(invoice.center_id)}
                    className="text-left font-semibold outline-none hover:underline focus-visible:underline"
                  >
                    {invoice.center?.name ?? '—'}
                  </button>
                  {invoice.plan && (
                    <span className="block text-sm text-muted-foreground">{invoice.plan.name}</span>
                  )}
                </TableCell>
              )}
              <TableCell>
                {formatMonthKey(invoice.period_start, { year: true })}
                {invoice.memo && <span className="block text-sm text-muted-foreground">{invoice.memo}</span>}
              </TableCell>
              <TableCell className="text-right font-semibold numeric">{formatWon(invoice.amount)}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {formatDateKey(invoice.due_date)}
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-0.5">
                  <InvoiceStatusBadge invoice={invoice} today={today} />
                  {invoice.paid_at && (
                    <span className="text-sm text-muted-foreground">
                      {formatDateWithYear(invoice.paid_at)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  {invoice.status === 'pending' && (
                    <Button size="sm" disabled={pending} onClick={() => change(invoice, 'paid')}>
                      <Check aria-hidden />
                      {t('markPaid')}
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t('more')} disabled={pending}>
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {invoice.status !== 'pending' && (
                        <DropdownMenuItem className="min-h-11" onSelect={() => change(invoice, 'pending')}>
                          {invoice.status === 'void' ? t('restore') : t('markPending')}
                        </DropdownMenuItem>
                      )}
                      {invoice.status !== 'void' && (
                        <DropdownMenuItem
                          className="min-h-11 text-danger"
                          onSelect={() => setVoiding(invoice)}
                        >
                          {t('void')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {voiding && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setVoiding(null)}
          title={t('voidConfirm.title', {
            name: voiding.center?.name ?? '',
            month: formatMonthKey(voiding.period_start, { year: true }),
          })}
          description={t('voidConfirm.description')}
          confirmLabel={t('void')}
          pending={pending}
          onConfirm={() => change(voiding, 'void', { undoable: false, onDone: () => setVoiding(null) })}
        />
      )}
    </div>
  );
}
