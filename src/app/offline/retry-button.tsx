'use client';

import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

export function RetryButton() {
  const t = useTranslations('common');
  return (
    <Button size="lg" onClick={() => window.location.reload()}>
      <RotateCw aria-hidden />
      {t('retry')}
    </Button>
  );
}
