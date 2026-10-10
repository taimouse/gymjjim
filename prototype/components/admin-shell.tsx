'use client';

import { Building2, CalendarDays, Dumbbell, Home, type LucideIcon, MessageSquareText } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { cn } from '@/lib/utils';

import { ProtoBanner } from './proto-banner';
import { ProtoGate } from './proto-gate';

const NAV = [
  { href: '/admin/', key: 'calendar', icon: CalendarDays },
  { href: '/admin/programs/', key: 'programs', icon: Dumbbell },
  { href: '/admin/messages/', key: 'messages', icon: MessageSquareText },
  { href: '/admin/settings/', key: 'settings', icon: Building2 },
] as const satisfies readonly { href: string; key: string; icon: LucideIcon }[];

const normalize = (path: string) => (path.endsWith('/') ? path : `${path}/`);

/** 프로토타입 관리자 화면 틀: 왼쪽 메뉴(모바일은 위쪽 가로 메뉴) + 본문 */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('prototype.admin');
  const pathname = normalize(usePathname());
  return (
    <div className="min-h-dvh bg-surface">
      <ProtoBanner />
      <div className="mx-auto flex max-w-[1400px] flex-col lg:flex-row">
        <aside className="border-b bg-background lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
          <div className="flex items-center justify-between p-4">
            <Link href="/">
              <BrandMark />
            </Link>
          </div>
          <nav aria-label={t('nav.calendar')} className="overflow-x-auto px-2 pb-2 lg:pb-0">
            <ul className="flex gap-1 lg:flex-col">
              {NAV.map(({ href, key, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <li key={key}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium whitespace-nowrap',
                        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="size-5" aria-hidden />
                      {t(`nav.${key}`)}
                    </Link>
                  </li>
                );
              })}
              <li className="lg:mt-4 lg:border-t lg:pt-4">
                <Link
                  href="/"
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted"
                >
                  <Home className="size-4" aria-hidden />
                  {t('toHome')}
                </Link>
              </li>
            </ul>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 lg:p-8">
          <ProtoGate>{() => children}</ProtoGate>
        </main>
      </div>
    </div>
  );
}
