'use client';

import { useTranslations } from 'next-intl';

import { useAdmin } from '@/components/admin/admin-context';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { MemberSearchRow } from '@/features/members/queries';
import { formatMonthDay, maskPhone } from '@/lib/format';

import { PassStatusBadge } from './pass-status-badge';

/** 회원 목록 표. 전화번호는 가운데 마스킹, 행을 누르면 상세 드로어 */
export function MemberTable({ rows, onOpen }: { rows: MemberSearchRow[]; onOpen: (id: string) => void }) {
  const t = useTranslations('members');
  const { timezone } = useAdmin();

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table className="text-base">
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.name')}</TableHead>
            <TableHead>{t('columns.phone')}</TableHead>
            <TableHead>{t('columns.pass')}</TableHead>
            <TableHead className="hidden lg:table-cell">{t('columns.tags')}</TableHead>
            <TableHead className="hidden md:table-cell">{t('columns.joined')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="h-14 cursor-pointer" onClick={() => onOpen(row.id)}>
              <TableCell>
                <button
                  type="button"
                  className="text-left font-semibold outline-none focus-visible:underline"
                >
                  {row.name}
                </button>
                {!row.linked && <span className="sr-only">{t('appNotLinked')}</span>}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{maskPhone(row.phone)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PassStatusBadge
                    state={row.pass_state}
                    remaining={row.pass_remaining}
                    daysLeft={row.pass_days_left}
                  />
                  {row.pass_name && (
                    <span className="hidden truncate text-sm text-muted-foreground xl:inline">
                      {row.pass_name}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <div className="flex flex-wrap gap-1">
                  {row.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {formatMonthDay(row.joined_at, timezone)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
