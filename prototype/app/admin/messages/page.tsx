'use client';

import { Clock3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_TYPES,
  renderNotification,
} from '@/features/notifications/templates';

import { ME_ID } from '../../../lib/seed';
import { useProtoState } from '../../../lib/store';

/** 자동 메시지: 받는 회원을 고르면 9종 알림톡이 그 회원 이름으로 채워진 모습을 보여준다 */
export default function MessagesPage() {
  const t = useTranslations('prototype.admin.messages');
  const tType = useTranslations('notifications.types');
  const state = useProtoState();
  const [memberId, setMemberId] = useState(ME_ID);
  if (!state) return null;
  const member = state.members.find((item) => item.id === memberId) ?? state.members[0];

  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Field className="mb-6 max-w-xs">
        <FieldLabel htmlFor="message-recipient">{t('recipient')}</FieldLabel>
        <Select value={member?.id} onValueChange={setMemberId}>
          <SelectTrigger id="message-recipient" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {state.members.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {NOTIFICATION_TYPES.map((type) => {
          const rendered = renderNotification(type, NOTIFICATION_TEMPLATES[type].sample, {
            memberName: member?.name ?? null,
            centerName: state.center.name,
            timezone: state.center.timezone,
          });
          return (
            <li key={type} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{tType(type)}</h2>
                <Badge variant="outline" className="font-mono text-xs">
                  {NOTIFICATION_TEMPLATES[type].code}
                </Badge>
              </div>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock3 className="size-4" aria-hidden />
                <span className="sr-only">{t('when')}</span>
                {t(`triggers.${type}`)}
              </p>
              <p className="flex-1 rounded-lg bg-muted/60 p-3 text-sm leading-relaxed whitespace-pre-line">
                {rendered?.text}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
