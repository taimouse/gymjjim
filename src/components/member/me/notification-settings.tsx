'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useErrorText } from '@/components/form-messages';
import { useMember } from '@/components/member/member-context';
import { Switch } from '@/components/ui/switch';
import { updateMySettings } from '@/features/members/actions';

/** 알림 설정: 바꾸는 즉시 저장 (실패하면 원래대로) */
export function NotificationSettings() {
  const t = useTranslations('member.me');
  const errorText = useErrorText();
  const router = useRouter();
  const { centerId, notifyEnabled, marketingAgreed } = useMember();
  const [values, setValues] = useState({ notifyEnabled, marketingAgreed });
  const [pending, startTransition] = useTransition();

  const save = (next: typeof values) => {
    const previous = values;
    setValues(next);
    startTransition(async () => {
      const result = await updateMySettings({ centerId, ...next });
      if (!result.ok) {
        setValues(previous);
        toast.error(errorText(result.code));
        return;
      }
      toast.success(t('saved'));
      router.refresh();
    });
  };

  return (
    <section aria-labelledby="me-settings" className="space-y-3">
      <h2 id="me-settings" className="text-lg font-bold">
        {t('settings')}
      </h2>
      <div className="divide-y rounded-2xl border bg-card">
        <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 p-4">
          <span className="min-w-0">
            <span className="block font-medium">{t('notify')}</span>
            <span className="block text-sm text-muted-foreground">{t('notifyHint')}</span>
          </span>
          <Switch
            checked={values.notifyEnabled}
            disabled={pending}
            onCheckedChange={(checked) => save({ ...values, notifyEnabled: checked })}
          />
        </label>
        <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 p-4">
          <span className="font-medium">{t('marketing')}</span>
          <Switch
            checked={values.marketingAgreed}
            disabled={pending}
            onCheckedChange={(checked) => save({ ...values, marketingAgreed: checked })}
          />
        </label>
      </div>
    </section>
  );
}
