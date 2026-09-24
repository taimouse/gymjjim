'use client';

import { CalendarDays, Dumbbell, type LucideIcon, Settings, Sun, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export const ADMIN_NAV = [
  { href: '/admin', key: 'today', icon: Sun },
  { href: '/admin/calendar', key: 'calendar', icon: CalendarDays },
  { href: '/admin/members', key: 'members', icon: Users },
  { href: '/admin/programs', key: 'programs', icon: Dumbbell },
  { href: '/admin/settings', key: 'settings', icon: Settings },
] as const satisfies readonly { href: string; key: string; icon: LucideIcon }[];

export function isActivePath(pathname: string, href: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 사이드바 메뉴 5개 (CLAUDE.md 7번 고정).
 * compactOnTablet: 태블릿 폭(md~xl)에서는 아이콘만 보이고 라벨은 툴팁으로.
 */
export function AdminNav({
  compactOnTablet = false,
  onNavigate,
}: {
  compactOnTablet?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations('admin.nav');
  const pathname = usePathname();

  return (
    <nav aria-label={t('label')} className="flex flex-col gap-1">
      {ADMIN_NAV.map(({ href, key, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        const link = (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground hover:bg-muted',
              compactOnTablet && 'md:justify-center md:px-0 xl:justify-start xl:px-3',
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden />
            <span className={cn(compactOnTablet && 'md:sr-only xl:not-sr-only')}>{t(key)}</span>
          </Link>
        );
        if (!compactOnTablet) return <div key={href}>{link}</div>;
        return (
          <Tooltip key={href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right" className="xl:hidden">
              {t(key)}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}
