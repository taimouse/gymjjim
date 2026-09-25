'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

import { useAdmin } from './admin-context';
import { MemberCommandResults } from './members/member-command-results';
import { useMemberDrawer } from './members/use-member-drawer';
import { ADMIN_NAV } from './admin-nav';

/** ⌘K / Ctrl+K 빠른 검색: 회원(이름·뒷 4자리) → 선택하면 어느 화면에서든 회원 드로어, 그리고 메뉴 이동 */
export function CommandPalette() {
  const t = useTranslations('admin');
  const memberDrawer = useMemberDrawer();
  const router = useRouter();
  const { commandOpen, setCommandOpen } = useAdmin();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandOpen, setCommandOpen]);

  const close = () => {
    setCommandOpen(false);
    setQuery('');
  };

  return (
    <CommandDialog
      open={commandOpen}
      onOpenChange={(open) => (open ? setCommandOpen(true) : close())}
      title={t('command.title')}
      description={t('command.description')}
      className="sm:max-w-xl"
    >
      {/* shadcn 의 CommandDialog 는 cmdk 루트(Command)를 따로 감싸야 한다 */}
      <Command>
        <CommandInput value={query} onValueChange={setQuery} placeholder={t('command.placeholder')} />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>{t('command.empty')}</CommandEmpty>
          <MemberCommandResults
            query={query}
            onSelect={(memberId) => {
              close();
              memberDrawer.open(memberId);
            }}
          />
          <CommandGroup heading={t('command.menus')}>
            {ADMIN_NAV.map(({ href, key, icon: Icon }) => (
              <CommandItem
                key={href}
                value={t(`nav.${key}`)}
                onSelect={() => {
                  close();
                  router.push(href);
                }}
                className="min-h-11"
              >
                <Icon aria-hidden />
                {t(`nav.${key}`)}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
