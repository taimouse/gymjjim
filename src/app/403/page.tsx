import { ShieldX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { SignOutButton } from '@/components/sign-out-button';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { firstParam } from '@/lib/search-params';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('forbidden');
  return { title: t('title'), robots: { index: false } };
}

const REASONS = ['admin', 'owner', 'member'] as const;
type Reason = (typeof REASONS)[number];

function isReason(value: string | undefined): value is Reason {
  return (REASONS as readonly string[]).includes(value ?? '');
}

/** 권한 없음(403). proxy.ts 가 rewrite 하거나 레이아웃이 redirect 한다. */
export default async function ForbiddenPage({ searchParams }: PageProps<'/403'>) {
  const reason = firstParam((await searchParams).reason);
  const t = await getTranslations('forbidden');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <Empty className="max-w-md border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldX aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t('title')}</EmptyTitle>
          <EmptyDescription>{t(isReason(reason) ? reason : 'default')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center">
          <Button asChild variant="outline">
            <Link href="/">{t('home')}</Link>
          </Button>
          <SignOutButton to={reason === 'member' ? 'member' : 'admin'} variant="ghost" />
        </EmptyContent>
      </Empty>
    </main>
  );
}
