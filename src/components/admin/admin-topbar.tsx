'use client';

import { ChevronDown, LogOut, Menu, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { signOut } from '@/features/auth/actions';

import { useAdmin } from './admin-context';
import { AdminNav } from './admin-nav';

/** 상단: (모바일) 메뉴 버튼 · ⌘K 회원 검색 · 센터명 · 계정 메뉴 */
export function AdminTopbar() {
  const t = useTranslations('admin');
  const tAuth = useTranslations('auth');
  const { centerName, staffName, role, setCommandOpen } = useAdmin();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label={t('nav.openMenu')}
        onClick={() => setMenuOpen(true)}
      >
        <Menu aria-hidden />
      </Button>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 gap-6 p-4">
          <SheetHeader className="p-0">
            <SheetTitle>
              <BrandMark />
            </SheetTitle>
          </SheetHeader>
          <AdminNav onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg bg-muted px-3 text-left text-muted-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 md:max-w-md"
      >
        <Search className="size-5 shrink-0" aria-hidden />
        <span className="truncate">
          {t('topbar.search')}
          <span className="hidden lg:inline">
            {' · '}
            {t('topbar.searchHint')}
          </span>
        </span>
        <Kbd className="ml-auto hidden sm:inline-flex">⌘K</Kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden truncate font-semibold lg:inline">{centerName}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1.5 px-2" aria-label={t('topbar.account')}>
              <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-soft-foreground">
                {staffName.slice(0, 1)}
              </span>
              <span className="hidden sm:inline">{staffName}</span>
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-0.5">
              <p className="font-semibold">{staffName}</p>
              <p className="text-sm font-normal text-muted-foreground">
                {centerName} · {t(`topbar.role.${role}`)}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <form action={signOut}>
              <input type="hidden" name="to" value="admin" />
              <DropdownMenuItem asChild>
                <button type="submit" className="min-h-11 w-full">
                  <LogOut aria-hidden />
                  {tAuth('signOut')}
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
