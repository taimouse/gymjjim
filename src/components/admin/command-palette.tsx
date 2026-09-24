'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

import { useAdmin } from './admin-context';
import { ADMIN_NAV } from './admin-nav';

/**
 * ⌘K / Ctrl+K 빠른 검색. 어느 관리자 화면에서든 열린다.
 * children 에 검색어를 받아 결과 그룹을 그리는 함수를 넘길 수 있다 (회원 검색).
 */
export function CommandPalette({
  renderResults,
}: {
  renderResults?: (query: string, close: () => void) => ReactNode;
}) {
  const t = useTranslations('admin');
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
      <CommandInput value={query} onValueChange={setQuery} placeholder={t('command.placeholder')} />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>{t('command.empty')}</CommandEmpty>
        {renderResults?.(query, close)}
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
    </CommandDialog>
  );
}
