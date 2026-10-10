'use client';

import { FlaskConical, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { Button } from '@/components/ui/button';

import { protoActions } from '../lib/store';

/** 맨 위 안내 띠: 프로토타입이라는 것 + 처음 상태로 되돌리기 */
export function ProtoBanner() {
  const t = useTranslations('prototype');
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-sm text-warning-soft-foreground">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{t('banner')}</span>
      <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2" onClick={() => setConfirm(true)}>
        <RotateCcw aria-hidden />
        {t('reset')}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('resetConfirm')}
        confirmLabel={t('reset')}
        onConfirm={() => {
          protoActions.reset();
          setConfirm(false);
          toast.success(t('resetDone'));
        }}
      />
    </div>
  );
}
