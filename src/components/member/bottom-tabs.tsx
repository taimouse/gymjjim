'use client';

import { CalendarPlus, CalendarCheck, CircleUserRound, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

const TABS = [
  { href: '/m/book', key: 'book', icon: CalendarPlus },
  { href: '/m/my-bookings', key: 'myBookings', icon: CalendarCheck },
  { href: '/m/me', key: 'me', icon: CircleUserRound },
] as const satisfies readonly { href: string; key: string; icon: LucideIcon }[];

/** 하단 탭 3개: 예약 / 내 예약 / 내 정보 */
export function BottomTabs() {
  const t = useTranslations('member.tabs');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-md grid-cols-3">
        {TABS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 text-sm font-medium outline-none focus-visible:bg-muted',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-6" aria-hidden strokeWidth={active ? 2.4 : 1.8} />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
