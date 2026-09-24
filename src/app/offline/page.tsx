import { WifiOff } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { RetryButton } from './retry-button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('offline');
  return { title: t('title') };
}

/** 오프라인 안내 (서비스 워커가 미리 캐시해 두고 네트워크가 없을 때 보여준다) */
export default async function OfflinePage() {
  const t = await getTranslations('offline');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <WifiOff className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-muted-foreground">{t('description')}</p>
      <RetryButton />
    </main>
  );
}
