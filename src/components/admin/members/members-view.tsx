'use client';

import { FileUp, Search, UserPlus, Users } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { PageHeader } from '@/components/admin/page-header';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useMemberSearch } from '@/features/members/queries';
import {
  EMPTY_MEMBER,
  MEMBER_FILTERS,
  MEMBER_SORTS,
  type MemberFilter,
  type MemberSort,
} from '@/features/members/schema';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { CsvImportDialog } from './csv-import-dialog';
import { MemberFormSheet } from './member-form-sheet';
import { MemberTable } from './member-table';
import { useMemberDrawer } from './use-member-drawer';

const PAGE_SIZE = 20;

function pick<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

/** 회원 목록: 검색(이름·뒷 4자리) + 필터 칩 + 정렬 + 페이지네이션. 상태는 URL 에 남긴다 */
export function MembersView() {
  const t = useTranslations('members');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { centerId } = useAdmin();
  const drawer = useMemberDrawer();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const query = searchParams.get('q') ?? '';
  const filter = pick<MemberFilter>(searchParams.get('filter'), MEMBER_FILTERS, 'all');
  const sort = pick<MemberSort>(searchParams.get('sort'), MEMBER_SORTS, 'name');
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [input, setInput] = useState(query);

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '' || value === 'all') params.delete(key);
        else params.set(key, value);
      }
      if (!('page' in changes)) params.delete('page');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // 입력이 멈추면 0.25초 뒤 검색 (즉시 검색)
  const debouncedInput = useDebouncedValue(input.trim(), 250);
  useEffect(() => {
    if (debouncedInput !== query) update({ q: debouncedInput || null });
  }, [debouncedInput, query, update]);

  const result = useMemberSearch(centerId, { query, filter, sort, page, pageSize: PAGE_SIZE });
  const rows = result.data?.rows ?? [];
  const total = result.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <FileUp aria-hidden />
              {t('import')}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <UserPlus aria-hidden />
              {t('add')}
            </Button>
          </>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <InputGroup className="max-w-md flex-1">
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
          <Select value={sort} onValueChange={(value) => update({ sort: value === 'name' ? null : value })}>
            <SelectTrigger className="w-40" aria-label={t('sort.label')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBER_SORTS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`sort.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => value && update({ filter: value })}
          aria-label={t('filters.label')}
          className="flex-wrap justify-start gap-2"
        >
          {MEMBER_FILTERS.map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              className="h-10 rounded-full border px-4 data-[state=on]:border-primary data-[state=on]:bg-brand-soft data-[state=on]:text-brand-soft-foreground"
            >
              {t(`filters.${option}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {result.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{query || filter !== 'all' ? t('empty.searchTitle') : t('empty.title')}</EmptyTitle>
            <EmptyDescription>
              {query || filter !== 'all' ? t('empty.searchDescription') : t('empty.description')}
            </EmptyDescription>
          </EmptyHeader>
          {!query && filter === 'all' && (
            <EmptyContent>
              <Button onClick={() => setCreating(true)}>
                <UserPlus aria-hidden />
                {t('add')}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <MemberTable rows={rows} onOpen={drawer.open} />
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-muted-foreground">{t('total', { count: total })}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                {t('prev')}
              </Button>
              <span className="min-w-16 text-center tabular-nums">{t('page', { page, pages })}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => update({ page: String(page + 1) })}
              >
                {t('next')}
              </Button>
            </div>
          </div>
        </>
      )}

      {creating && (
        <MemberFormSheet
          initialValues={EMPTY_MEMBER}
          onClose={() => setCreating(false)}
          onCreated={drawer.open}
        />
      )}
      {importing && <CsvImportDialog onClose={() => setImporting(false)} />}
    </>
  );
}
