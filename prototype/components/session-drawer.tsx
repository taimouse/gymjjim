'use client';

import { CalendarClock, Clock, Eye, Trash2, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { EditSheet } from '@/components/admin/edit-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pendingPublishAt } from '@/features/sessions/publish';
import { formatDate, formatDateTime, formatTimeRange } from '@/lib/format';
import { useNow } from '@/lib/use-now';

import { toCalendarSession } from '../lib/selectors';
import { protoActions } from '../lib/store';
import type { ProtoState } from '../lib/types';

/** 수업 드로어 (프로토타입): 정보 · 공개 상태 · 지금 공개 · 삭제 */
export function SessionDrawer({
  state,
  sessionId,
  onClose,
}: {
  state: ProtoState;
  sessionId: string;
  onClose: () => void;
}) {
  const t = useTranslations('prototype.admin.drawer');
  const tPublish = useTranslations('publish');
  const tScope = useTranslations('calendar.scope');
  const tCalendar = useTranslations('calendar.drawer');
  const now = useNow();
  const raw = state.sessions.find((session) => session.id === sessionId);
  if (!raw) return null;
  const session = toCalendarSession(state, raw);
  const timezone = state.center.timezone;
  const pending = pendingPublishAt(session, now.getTime());
  const sessionPending = !!session.publish_at && Date.parse(session.publish_at) > now.getTime();
  const groupSize = raw.recurrence_group_id
    ? state.sessions.filter((s) => s.recurrence_group_id === raw.recurrence_group_id).length
    : 0;

  const publish = (scope: 'this' | 'following') => {
    protoActions.publishNow(sessionId, scope);
    toast.success(t('published'));
  };

  return (
    <EditSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ backgroundColor: session.program?.color }} />
          {session.program?.name}
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
          <span className="flex items-center gap-1">
            <Clock className="size-4" aria-hidden />
            {formatDate(session.starts_at, timezone)}{' '}
            {formatTimeRange(session.starts_at, session.ends_at, timezone)}
          </span>
          <span className="flex items-center gap-1">
            <UserRound className="size-4" aria-hidden />
            {session.instructor?.name ?? tCalendar('noInstructor')}
          </span>
        </span>
      }
      footer={
        <Button
          variant="ghost"
          className="text-danger"
          onClick={() => {
            protoActions.deleteSession(sessionId);
            toast.success(t('deleted'));
            onClose();
          }}
        >
          <Trash2 aria-hidden />
          {t('delete')}
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-base">
            {t('booked', { booked: session.booked_count, capacity: session.capacity })}
          </Badge>
          {session.waitlist_count > 0 && (
            <Badge variant="info">{t('waitlist', { count: session.waitlist_count })}</Badge>
          )}
          {groupSize > 1 && <Badge variant="outline">{t('group', { count: groupSize })}</Badge>}
        </div>

        {pending ? (
          <div className="space-y-3 rounded-xl bg-warning-soft p-4 text-warning-soft-foreground">
            <p className="flex items-center gap-2 font-medium">
              <CalendarClock className="size-4 shrink-0" aria-hidden />
              {tPublish('sessionPending', { when: formatDateTime(pending, timezone) })}
            </p>
            {sessionPending && (
              <div className="flex flex-wrap gap-2">
                {(raw.recurrence_group_id ? (['this', 'following'] as const) : (['this'] as const)).map(
                  (scope) => (
                    <Button
                      key={scope}
                      size="sm"
                      variant="outline"
                      className="bg-background"
                      onClick={() => publish(scope)}
                    >
                      <Eye aria-hidden />
                      {raw.recurrence_group_id ? `${t('publishNow')} · ${tScope(scope)}` : t('publishNow')}
                    </Button>
                  ),
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-success-soft p-4 font-medium text-success-soft-foreground">
            <Eye className="size-4" aria-hidden />
            {t('publishedNow')}
          </p>
        )}
      </div>
    </EditSheet>
  );
}
