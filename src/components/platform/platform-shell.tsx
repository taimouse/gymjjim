'use client';

import {
  Building2,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  ReceiptText,
  Tags,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { signOut } from '@/features/auth/actions';
import { cn } from '@/lib/utils';

const PLATFORM_NAV = [
  { href: '/platform', key: 'dashboard', icon: LayoutDashboard },
  { href: '/platform/centers', key: 'centers', icon: Building2 },
  { href: '/platform/plans', key: 'plans', icon: Tags },
  { href: '/platform/invoices', key: 'invoices', icon: ReceiptText },
] as const satisfies readonly { href: string; key: string; icon: LucideIcon }[];

function isActivePath(pathname: string, href: string): boolean {
  return href === '/platform' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** 운영자 콘솔 메뉴 (대시보드 · 센터 · 요금제 · 청구·입금) */
export function PlatformNav({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('platform.nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-1">
      {PLATFORM_NAV.map(({ href, key, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-muted',
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

/** 상단: (모바일) 메뉴 버튼 · 운영자 콘솔 표시 · 계정 메뉴 */
export function PlatformTopbar({ adminName }: { adminName: string }) {
  const t = useTranslations('platform');
  const tAuth = useTranslations('auth');
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
          <PlatformNav onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand-soft-foreground">
        {t('console')}
      </span>

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-1.5 px-2" aria-label={t('account')}>
              <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-soft-foreground">
                {adminName.slice(0, 1)}
              </span>
              <span className="hidden sm:inline">{adminName}</span>
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-0.5">
              <p className="font-semibold">{adminName}</p>
              <p className="text-sm font-normal text-muted-foreground">{t('role')}</p>
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
