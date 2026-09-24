'use client';

import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_TYPES,
  previewNotification,
  templateVariableNames,
} from '@/features/notifications/templates';

/** 알림톡 템플릿 9종: 검수 신청할 원문(코드 · 변수)과 미리보기 */
export function NotificationTemplates() {
  const t = useTranslations('settings.notifications.templates');
  const tType = useTranslations('notifications.types');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {NOTIFICATION_TYPES.map((type) => (
            <li key={type} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{tType(type)}</h3>
                <Badge variant="outline" className="font-mono text-xs" aria-label={t('code')}>
                  {NOTIFICATION_TEMPLATES[type].code}
                </Badge>
              </div>
              <p
                className="flex-1 rounded-lg bg-muted/60 p-3 text-sm leading-relaxed whitespace-pre-line"
                aria-label={t('preview')}
              >
                {previewNotification(type).text}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">{t('variables')}</span>
                {templateVariableNames(type).map((name) => (
                  <code key={name} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {name}
                  </code>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
