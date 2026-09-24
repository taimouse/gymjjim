'use client';

import { RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorAlert } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { toAppErrorCode } from '@/lib/errors';

/** 목록을 못 불러왔을 때: 에러 코드별 안내 + 다시 시도 */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations('common');
  return (
    <div className="space-y-3">
      <ErrorAlert code={toAppErrorCode(error)} className="text-base" />
      <Button variant="outline" className="w-full" onClick={onRetry}>
        <RotateCw aria-hidden />
        {t('retry')}
      </Button>
    </div>
  );
}
