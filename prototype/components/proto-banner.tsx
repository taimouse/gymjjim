'use client';

import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { Button } from '@/components/ui/button';

import { resetDb } from '../mock/db';

/** 맨 위 안내 띠: 프로토타입 안내 · 관리자/회원 화면 바로가기 · 처음 상태로 */
export function ProtoBanner() {
  const t = useTranslations('prototype');
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning-soft px-4 py-1.5 text-sm text-warning-soft-foreground">
      <span className="flex min-w-0 items-center gap-1.5">
        <FlaskConical className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{t('banner')}</span>
      </span>
      <span className="flex items-center gap-1">
        <Link href="/admin/" className="rounded px-2 py-1 font-medium underline-offset-4 hover:underline">
          {t('home.admin.title')}
        </Link>
        <Link href="/m/book/" className="rounded px-2 py-1 font-medium underline-offset-4 hover:underline">
          {t('home.member.title')}
        </Link>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setConfirm(true)}>
          <RotateCcw aria-hidden />
          {t('reset')}
        </Button>
      </span>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('resetConfirm')}
        confirmLabel={t('reset')}
        onConfirm={() => {
          resetDb();
          void queryClient.invalidateQueries();
          setConfirm(false);
          toast.success(t('resetDone'));
        }}
      />
    </div>
  );
}
