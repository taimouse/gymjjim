'use client';

import { useQueryClient } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { PassStatusBadge } from '@/components/admin/members/pass-status-badge';
import { useErrorText } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { staffBookAction } from '@/features/booking/actions';
import { memberKeys, type MemberSearchRow, useMemberSearch } from '@/features/members/queries';
import { sessionKeys } from '@/features/sessions/queries';
import { maskPhone } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';

/** 회원 대리 예약: ⌘K 와 같은 회원 검색 → 선택 → 정원이 차면 "정원 초과 / 대기" 선택 */
export function StaffBookDialog({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const t = useTranslations('calendar.staffBook');
  const errorText = useErrorText();
  const { centerId } = useAdmin();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [full, setFull] = useState<MemberSearchRow | null>(null);
  const [pending, startTransition] = useTransition();
  const term = useDebouncedValue(query.trim(), 150);
  const search = useMemberSearch(
    centerId,
    { query: term, filter: 'all', sort: 'name', page: 1, pageSize: 10 },
    term.length > 0,
  );

  const book = (member: MemberSearchRow, options: { allowOverCapacity?: boolean; waitlist?: boolean } = {}) =>
    startTransition(async () => {
      const result = await staffBookAction({
        sessionId,
        memberId: member.id,
        overrideRules: true,
        allowOverCapacity: options.allowOverCapacity ?? false,
        waitlist: options.waitlist ?? false,
      });
      if (!result.ok) {
        if (result.code === 'SESSION_FULL') setFull(member);
        else toast.error(errorText(result.code));
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sessionKeys.roster(sessionId) }),
        queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
        queryClient.invalidateQueries({ queryKey: memberKeys.all }),
      ]);
      toast.success(
        result.data.status === 'waitlisted'
          ? t('waitlisted', { name: member.name, position: result.data.waitlist_position ?? 0 })
          : t('done', { name: member.name }),
      );
      onClose();
    });

  return (
    <>
      <CommandDialog
        open={!full}
        onOpenChange={(open) => !open && onClose()}
        title={t('title')}
        description={t('hint')}
        className="sm:max-w-lg"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={t('placeholder')}
          disabled={pending}
        />
        <p className="px-3 pt-2 text-sm text-muted-foreground">{t('hint')}</p>
        <CommandList className="max-h-[50vh]">
          {term.length > 0 && !search.isFetching && <CommandEmpty>{t('empty')}</CommandEmpty>}
          <CommandGroup>
            {(search.data?.rows ?? []).map((member) => (
              <CommandItem
                key={member.id}
                value={`member ${member.id} ${member.name} ${member.phone ?? ''}`}
                keywords={[member.name, member.phone ?? '']}
                onSelect={() => book(member)}
                disabled={pending}
                className="min-h-12"
              >
                <UserRound aria-hidden />
                <span className="font-medium">{member.name}</span>
                <span className="text-muted-foreground tabular-nums">{maskPhone(member.phone)}</span>
                <PassStatusBadge
                  state={member.pass_state}
                  remaining={member.pass_remaining}
                  daysLeft={member.pass_days_left}
                  className="ml-auto"
                />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      {full && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && onClose()}
          title={t('fullTitle')}
          description={t('fullDescription', { name: full.name })}
          confirmLabel={t('overCapacity')}
          destructive={false}
          onConfirm={() => book(full, { allowOverCapacity: true })}
          pending={pending}
        >
          <Button variant="secondary" disabled={pending} onClick={() => book(full, { waitlist: true })}>
            {t('addWaitlist')}
          </Button>
        </ConfirmDialog>
      )}
    </>
  );
}
