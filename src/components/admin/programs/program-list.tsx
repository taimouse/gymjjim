'use client';

import { CalendarClock, Clock, Dumbbell, Plus, Ticket, User, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { useAdmin } from '@/components/admin/admin-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { type ProgramItem, useProgramsQuery } from '@/features/programs/queries';
import { EMPTY_PROGRAM, type ProgramFormValues } from '@/features/programs/schema';
import { useStaffQuery } from '@/features/staff/queries';
import { formatDateTime, toDateKey, toTimeKey } from '@/lib/format';
import { useNow } from '@/lib/use-now';

import { ProgramSheet } from './program-sheet';

function toFormValues(program: ProgramItem, timeZone: string): ProgramFormValues {
  return {
    name: program.name,
    type: program.type,
    defaultCapacity: program.default_capacity,
    durationMin: program.duration_min,
    color: program.color,
    defaultInstructorId: program.default_instructor_id,
    description: program.description ?? '',
    allowedProductIds: program.allowedProductIds,
    passCost: program.pass_cost,
    publishAt: program.publish_at
      ? `${toDateKey(program.publish_at, timeZone)}T${toTimeKey(program.publish_at, timeZone)}`
      : '',
  };
}

/** 아직 공개 전이면 공개 시각 */
function pendingPublish(program: ProgramItem, now: Date): string | null {
  return program.publish_at && new Date(program.publish_at).getTime() > now.getTime()
    ? program.publish_at
    : null;
}

/** 프로그램 카드 목록 + 생성/편집 드로어 */
export function ProgramList() {
  const t = useTranslations('programs');
  const tPublish = useTranslations('publish');
  const { centerId, isOwner, timezone } = useAdmin();
  const programs = useProgramsQuery(centerId);
  const now = useNow();
  const staff = useStaffQuery(centerId);
  const [editing, setEditing] = useState<{ id?: string; values: ProgramFormValues } | null>(null);

  const staffById = useMemo(() => new Map((staff.data ?? []).map((s) => [s.id, s])), [staff.data]);

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing({ values: EMPTY_PROGRAM })}>
            <Plus aria-hidden />
            {t('add')}
          </Button>
        </div>
      )}

      {programs.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (programs.data ?? []).length === 0 ? (
        <Empty className="border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Dumbbell aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
          {isOwner && (
            <EmptyContent>
              <Button onClick={() => setEditing({ values: EMPTY_PROGRAM })}>
                <Plus aria-hidden />
                {t('add')}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(programs.data ?? []).map((program) => {
            const instructor = program.default_instructor_id
              ? staffById.get(program.default_instructor_id)
              : undefined;
            const publishAt = pendingPublish(program, now);
            return (
              <li key={program.id}>
                <button
                  type="button"
                  onClick={() => setEditing({ id: program.id, values: toFormValues(program, timezone) })}
                  className="flex h-full w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="size-4 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: program.color }}
                    />
                    <span className="flex-1 truncate text-lg font-semibold">{program.name}</span>
                    <Badge variant={program.type === 'group' ? 'brand' : 'info'}>
                      {t(`type.${program.type}`)}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="size-4" aria-hidden />
                      <dd>{t('card.capacity', { count: program.default_capacity })}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-4" aria-hidden />
                      <dd>{t('card.duration', { minutes: program.duration_min })}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <User className="size-4" aria-hidden />
                      <dd className="truncate">{instructor?.name ?? t('card.noInstructor')}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Ticket className="size-4" aria-hidden />
                      <dd
                        className={
                          program.allowedProductIds.length === 0 ? 'text-warning-soft-foreground' : ''
                        }
                      >
                        {program.allowedProductIds.length === 0
                          ? t('card.noProducts')
                          : t('card.allowedProducts', { count: program.allowedProductIds.length })}
                      </dd>
                    </div>
                  </dl>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-brand-soft-foreground">
                    <Ticket className="size-4" aria-hidden />
                    {t('card.passCost', { count: program.pass_cost })}
                  </p>
                  {publishAt && (
                    <p className="flex items-center gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-sm text-warning-soft-foreground">
                      <CalendarClock className="size-4 shrink-0" aria-hidden />
                      {tPublish('scheduledAt', { when: formatDateTime(publishAt, timezone) })}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <ProgramSheet
          open
          onOpenChange={(open) => !open && setEditing(null)}
          programId={editing.id}
          initialValues={editing.values}
        />
      )}
    </div>
  );
}
