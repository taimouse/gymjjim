'use client';

import { UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAdmin } from '@/components/admin/admin-context';
import { CommandGroup, CommandItem } from '@/components/ui/command';
import { useMemberSearch } from '@/features/members/queries';
import { maskPhone } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { PassStatusBadge } from './pass-status-badge';

/** ⌘K 회원 검색 결과. 이름 1자 이상 또는 번호 4자리부터 찾는다 */
export function MemberCommandResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (memberId: string) => void;
}) {
  const t = useTranslations('admin.command');
  const { centerId } = useAdmin();
  const term = useDebouncedValue(query.trim(), 150);
  const digits = term.replace(/\D/g, '');
  const enabled = term.length > 0 && (/\D/.test(term.replace(/[\s-]/g, '')) || digits.length >= 4);
  const result = useMemberSearch(
    centerId,
    { query: term, filter: 'all', sort: 'name', page: 1, pageSize: 8 },
    enabled,
  );

  if (!enabled) return null;
  const rows = result.data?.rows ?? [];
  if (rows.length === 0) return null;

  return (
    <CommandGroup heading={t('members')}>
      {rows.map((row) => (
        <CommandItem
          key={row.id}
          value={`member ${row.id} ${row.name} ${row.phone ?? ''}`}
          keywords={[row.name, row.phone ?? '', row.phone?.slice(-4) ?? '']}
          onSelect={() => onSelect(row.id)}
          className="min-h-12"
        >
          <UserRound aria-hidden />
          <span className="font-medium">{row.name}</span>
          <span className="text-muted-foreground tabular-nums">{maskPhone(row.phone)}</span>
          <PassStatusBadge
            state={row.pass_state}
            remaining={row.pass_remaining}
            daysLeft={row.pass_days_left}
            className="ml-auto"
          />
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
