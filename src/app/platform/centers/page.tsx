import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { CentersView } from '@/components/platform/centers-view';
import { todayKey } from '@/lib/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.centers');
  return { title: t('title') };
}

export default function PlatformCentersPage() {
  return (
    <Suspense>
      <CentersView today={todayKey()} />
    </Suspense>
  );
}
