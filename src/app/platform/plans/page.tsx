import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PlansView } from '@/components/platform/plans-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.plans');
  return { title: t('title') };
}

export default function PlatformPlansPage() {
  return <PlansView />;
}
