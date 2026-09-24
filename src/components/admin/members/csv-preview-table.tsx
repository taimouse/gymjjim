'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { PreviewRow } from '@/features/members/csv-import';
import { maskPhone } from '@/lib/format';
import { cn } from '@/lib/utils';

/** CSV 미리보기: 오류 행은 빨갛게, 어느 칸이 문제인지 표시 */
export function CsvPreviewTable({ rows }: { rows: PreviewRow[] }) {
  const t = useTranslations('members.csv');
  const tColumns = useTranslations('members.columns');

  const statusBadge = (row: PreviewRow) => {
    if (row.status === 'ok') return <Badge variant="success">{t('statusOk')}</Badge>;
    if (row.status === 'existing') return <Badge variant="muted">{t('statusExisting')}</Badge>;
    if (row.status === 'duplicate') return <Badge variant="danger">{t('statusDuplicate')}</Badge>;
    return (
      <Badge variant="danger">
        {row.errorFields.map((field) => t('invalidField', { field: t(`fieldErrors.${field}`) })).join(', ')}
      </Badge>
    );
  };

  return (
    <div className="max-h-80 overflow-auto rounded-xl border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow>
            <TableHead className="w-14">{t('rowNumber')}</TableHead>
            <TableHead>{tColumns('name')}</TableHead>
            <TableHead>{tColumns('phone')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.line}
              className={cn((row.status === 'invalid' || row.status === 'duplicate') && 'bg-danger-soft/40')}
            >
              <TableCell className="text-muted-foreground tabular-nums">{row.line}</TableCell>
              <TableCell className="font-medium">{row.input.name || '—'}</TableCell>
              <TableCell className="tabular-nums">
                {row.output ? maskPhone(row.output.phone) : row.input.phone || '—'}
              </TableCell>
              <TableCell className="text-right">{statusBadge(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
