'use client';

import { BellRing } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { useErrorText } from '@/components/form-messages';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { updateNotificationSettings } from '@/features/centers/actions';

/** 알림 발송 규칙 안내 + SMS 대체발송 설정 (대표만 변경) */
export function SmsFallbackCard({ initial }: { initial: boolean }) {
  const t = useTranslations('settings.notifications');
  const errorText = useErrorText();
  const router = useRouter();
  const { isOwner } = useAdmin();
  const [smsFallback, setSmsFallback] = useState(initial);
  const [pending, startTransition] = useTransition();

  const change = (checked: boolean) => {
    setSmsFallback(checked);
    startTransition(async () => {
      const result = await updateNotificationSettings({ smsFallback: checked });
      if (!result.ok) {
        setSmsFallback(!checked);
        toast.error(errorText(result.code));
        return;
      }
      toast.success(t('saved'));
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BellRing className="size-5 text-primary" aria-hidden />
          {t('title')}
        </CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl bg-muted/60 p-4">
          <p className="mb-2 font-semibold">{t('rules.title')}</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {t.raw('rules.items').map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 has-disabled:cursor-default">
          <span className="min-w-0">
            <span className="block font-medium">{t('smsFallback')}</span>
            <span className="block text-sm text-muted-foreground">{t('smsFallbackHint')}</span>
          </span>
          <Switch checked={smsFallback} onCheckedChange={change} disabled={!isOwner || pending} />
        </label>
      </CardContent>
    </Card>
  );
}
