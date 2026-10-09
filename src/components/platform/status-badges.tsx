'use client';

import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';

import { Badge } from '@/components/ui/badge';
import type { CenterStatus, InvoiceStatus } from '@/features/platform/schema';

type Variant = ComponentProps<typeof Badge>['variant'];

const CENTER_VARIANTS: Record<CenterStatus, Variant> = {
  trial: 'info',
  active: 'success',
  suspended: 'danger',
  closed: 'muted',
};

/** 센터 이용 상태: 체험 / 이용 중 / 정지 / 해지 (색 + 텍스트) */
export function CenterStatusBadge({ status }: { status: CenterStatus }) {
  const t = useTranslations('platform.status');
  return <Badge variant={CENTER_VARIANTS[status]}>{t(status)}</Badge>;
}

/** 청구서가 납부 기한을 넘겼는지 (미납이고 기한 다음 날부터) */
export function isOverdue(invoice: { status: InvoiceStatus; due_date: string }, today: string): boolean {
  return invoice.status === 'pending' && invoice.due_date < today;
}

/** 청구서 상태: 미납 / 연체 / 입금 / 취소 */
export function InvoiceStatusBadge({
  invoice,
  today,
}: {
  invoice: { status: InvoiceStatus; due_date: string };
  today: string;
}) {
  const t = useTranslations('platform.invoiceStatus');
  if (isOverdue(invoice, today)) return <Badge variant="danger">{t('overdue')}</Badge>;
  const variant: Variant =
    invoice.status === 'paid' ? 'success' : invoice.status === 'pending' ? 'warning' : 'muted';
  return <Badge variant={variant}>{t(invoice.status)}</Badge>;
}
