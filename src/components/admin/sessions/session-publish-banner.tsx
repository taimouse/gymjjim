'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { useErrorText } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { setSessionPublishAt } from '@/features/sessions/actions';
import { type CalendarSession, sessionKeys } from '@/features/sessions/queries';
import type { EditScope } from '@/features/sessions/schema';
import { formatDateTime } from '@/lib/format';

/**
 * 공개 전 수업 안내 + 지금 공개.
 * 수업 자체가 공개 예약이면 바로 공개할 수 있고, 프로그램이 공개 전이면 안내만 한다(프로그램 화면에서 바꾼다).
 */
export function SessionPublishBanner({ session, now }: { session: CalendarSession; now: Date }) {
  const t = useTranslations('publish');
  const tScope = useTranslations('calendar.scope');
  const errorText = useErrorText();
  const { timezone } = useAdmin();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const future = (value: string | null | undefined) => !!value && new Date(value).getTime() > now.getTime();
  const sessionPending = future(session.publish_at);
  const programPending = future(session.program?.publish_at);
  if (!sessionPending && !programPending) return null;

  const publishNow = (scope: EditScope) =>
    startTransition(async () => {
      const result = await setSessionPublishAt({ sessionId: session.id, scope, publishAt: '' });
      if (!result.ok) {
        toast.error(errorText(result.code));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      toast.success(t('done', { count: result.data.updated }));
    });

  return (
    <div className="space-y-3 rounded-xl bg-warning-soft p-4 text-warning-soft-foreground">
      {sessionPending && session.publish_at && (
        <p className="flex items-center gap-2 font-medium">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          {t('sessionPending', { when: formatDateTime(session.publish_at, timezone) })}
        </p>
      )}
      {programPending && session.program?.publish_at && (
        <p className="flex items-center gap-2 text-sm">
          <CalendarClock className="size-4 shrink-0" aria-hidden />
          {t('programPending', { when: formatDateTime(session.program.publish_at, timezone) })}
        </p>
      )}
      {sessionPending && (
        <div className="flex flex-wrap gap-2">
          {session.recurrence_group_id ? (
            (['this', 'following'] as const).map((scope) => (
              <Button
                key={scope}
                size="sm"
                variant="outline"
                className="bg-background"
                disabled={pending}
                onClick={() => publishNow(scope)}
              >
                <Eye aria-hidden />
                {t('publishNow')} · {tScope(scope)}
              </Button>
            ))
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="bg-background"
              disabled={pending}
              onClick={() => publishNow('this')}
            >
              <Eye aria-hidden />
              {t('publishNow')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
