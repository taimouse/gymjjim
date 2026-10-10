'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useErrorText } from '@/components/form-messages';
import { decideCreditRequest } from '@/features/credits/actions';
import { creditKeys } from '@/features/credits/queries';

/** 충전 요청 승인·거절 (오늘 화면 · 회원 상세 공용). 처리 중인 요청 id 를 함께 돌려준다 */
export function useDecideCreditRequest() {
  const t = useTranslations('credits.requests');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const decide = (request: { id: string; amount: number }, approve: boolean, onDone?: () => void) => {
    setBusyId(request.id);
    startTransition(async () => {
      const result = await decideCreditRequest(request.id, approve);
      await queryClient.invalidateQueries({ queryKey: creditKeys.all });
      setBusyId(null);
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      toast.success(approve ? t('approved', { amount: request.amount }) : t('rejected'));
      onDone?.();
    });
  };

  return { decide, busyId };
}
