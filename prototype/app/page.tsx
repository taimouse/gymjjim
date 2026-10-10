'use client';

import { ChevronRight, MapPin, Phone, ShieldCheck, Smartphone, SquareKanban } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { BrandMark } from '@/components/brand-mark';
import { formatPhone } from '@/lib/format';

import { ProtoBanner } from '../components/proto-banner';
import { CENTER as center } from '../lib/seed';

const CARDS = [
  { href: '/m/book/', key: 'member', icon: Smartphone },
  { href: '/admin/', key: 'admin', icon: SquareKanban },
  { href: '/privacy/', key: 'privacy', icon: ShieldCheck },
] as const;

/** 프로토타입 첫 화면: 센터 소개 + 회원/관리자/처리방침 바로가기 */
export default function HomePage() {
  const t = useTranslations('prototype.home');
  return (
    <>
      <ProtoBanner />
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
        <header className="space-y-4">
          <BrandMark />
          <div className="space-y-2">
            <p className="font-semibold text-primary">{center.name}</p>
            <h1 className="text-3xl font-bold tracking-tight">{t('headline')}</h1>
            <p className="text-lg text-muted-foreground">{t('intro')}</p>
          </div>
          <dl className="grid gap-2 rounded-xl bg-muted/60 p-4 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Phone className="size-4 text-muted-foreground" aria-hidden />
              <dt className="sr-only">{t('phone')}</dt>
              <dd>
                <a href={`tel:${center.phone}`} className="font-medium underline-offset-4 hover:underline">
                  {formatPhone(center.phone)}
                </a>
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              <dt className="sr-only">{t('address')}</dt>
              <dd>{center.address}</dd>
            </div>
          </dl>
        </header>

        <ul className="grid gap-4 sm:grid-cols-3">
          {CARDS.map(({ href, key, icon: Icon }) => (
            <li key={key}>
              <Link
                href={href}
                className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm transition outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className="text-lg font-bold">{t(`${key}.title`)}</span>
                <span className="flex-1 text-sm text-muted-foreground">{t(`${key}.description`)}</span>
                <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                  {t('open')}
                  <ChevronRight className="size-4" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
