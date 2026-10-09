'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, FilePlus2, ReceiptText } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { PageHeader } from '@/components/admin/page-header';
import { ErrorAlert, useErrorText } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { issueMonthlyInvoices } from '@/features/platform/actions';
import { platformKeys, useInvoices } from '@/features/platform/queries';
import { INVOICE_STATUSES, type InvoiceStatus } from '@/features/platform/schema';
import { toAppErrorCode } from '@/lib/errors';
import { formatMonthKey, formatWon } from '@/lib/format';

import { InvoiceTable } from './invoice-table';

const MONTH_KEY = /^\d{4}-\d{2}-01$/;

function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return date.toISOString().slice(0, 10);
}

/** 청구·입금: 월별 청구서 목록 · 일괄 발행 · 입금 확인. 월·상태는 URL 에 남긴다 */
export function InvoicesView({ today }: { today: string }) {
  const t = useTranslations('platform.invoices');
  const tStatus = useTranslations('platform.invoiceStatus');
  const errorText = useErrorText();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const thisMonth = `${today.slice(0, 8)}01`;
  const monthParam = searchParams.get('month') ?? '';
  const month = MONTH_KEY.test(monthParam) ? monthParam : thisMonth;
  const status = INVOICE_STATUSES.find((value) => value === searchParams.get('status')) ?? null;

  const update = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === 'all') params.delete(key);
      else params.set(key, value);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const invoices = useInvoices({ month, status, centerId: null });
  const rows = invoices.data ?? [];
  const totals = rows.reduce(
    (sum, row) => {
      if (row.status === 'void') return sum;
      sum.billed += row.amount;
      if (row.status === 'paid') sum.paid += row.amount;
      else sum.unpaid += row.amount;
      return sum;
    },
    { billed: 0, paid: 0, unpaid: 0 },
  );
  const monthLabel = formatMonthKey(month, { year: true });

  const issue = () => {
    startTransition(async () => {
      const result = await issueMonthlyInvoices(month);
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: platformKeys.all });
      setConfirming(false);
      toast.success(result.data.count > 0 ? t('issued', { count: result.data.count }) : t('issuedNone'));
    });
  };

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setConfirming(true)}>
            <FilePlus2 aria-hidden />
            {t('issue', { month: formatMonthKey(month) })}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('prevMonth')}
            onClick={() => update({ month: shiftMonth(month, -1) })}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <span className="min-w-32 text-center text-lg font-bold">{monthLabel}</span>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('nextMonth')}
            onClick={() => update({ month: shiftMonth(month, 1) })}
          >
            <ChevronRight aria-hidden />
          </Button>
          {month !== thisMonth && (
            <Button variant="ghost" onClick={() => update({ month: null })}>
              {t('thisMonth')}
            </Button>
          )}
        </div>
        <ToggleGroup
          type="single"
          value={status ?? 'all'}
          onValueChange={(value) => value && update({ status: value })}
          aria-label={t('filterLabel')}
          className="flex-wrap justify-start gap-2"
        >
          {(['all', ...INVOICE_STATUSES] as const).map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              className="h-10 rounded-full border px-4 data-[state=on]:border-primary data-[state=on]:bg-brand-soft data-[state=on]:text-brand-soft-foreground"
            >
              {option === 'all' ? t('all') : tStatus(option satisfies InvoiceStatus)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {invoices.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : invoices.isError ? (
        <ErrorAlert code={toAppErrorCode(invoices.error)} />
      ) : rows.length === 0 ? (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptText aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title', { month: monthLabel })}</EmptyTitle>
            <EmptyDescription>{status ? t('empty.filtered') : t('empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="mb-3 text-muted-foreground">
            {t('totals', {
              billed: formatWon(totals.billed),
              paid: formatWon(totals.paid),
              unpaid: formatWon(totals.unpaid),
            })}
          </p>
          <InvoiceTable
            rows={rows}
            today={today}
            onOpenCenter={(centerId) => router.push(`/platform/centers?center=${centerId}`)}
          />
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('issueConfirm.title', { month: monthLabel })}
        description={t('issueConfirm.description')}
        confirmLabel={t('issueConfirm.confirm')}
        destructive={false}
        pending={pending}
        onConfirm={issue}
      />
    </>
  );
}
