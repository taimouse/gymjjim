import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import { InvoicesView } from '@/components/platform/invoices-view';
import { todayKey } from '@/lib/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.invoices');
  return { title: t('title') };
}

export default function PlatformInvoicesPage() {
  return (
    <Suspense>
      <InvoicesView today={todayKey()} />
    </Suspense>
  );
}
