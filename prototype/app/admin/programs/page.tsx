'use client';

import { CalendarClock, Clock, Plus, User, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { PageHeader } from '@/components/admin/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EMPTY_PROGRAM, type ProgramFormValues } from '@/features/programs/schema';
import { formatDateTime, toDateKey, toTimeKey } from '@/lib/format';
import { useNow } from '@/lib/use-now';

import { ProgramSheet } from '../../../components/program-sheet';
import { useProtoState } from '../../../lib/store';
import type { ProtoProgram } from '../../../lib/types';

function toFormValues(program: ProtoProgram, timeZone: string): ProgramFormValues {
  return {
    name: program.name,
    type: program.type,
    defaultCapacity: program.default_capacity,
    durationMin: program.duration_min,
    color: program.color,
    defaultInstructorId: program.default_instructor_id,
    description: program.description ?? '',
    allowedProductIds: [],
    publishAt: program.publish_at
      ? `${toDateKey(program.publish_at, timeZone)}T${toTimeKey(program.publish_at, timeZone)}`
      : '',
  };
}

/** 프로그램 카드 목록 + 만들기·수정 (공개 예약 시각 표시) */
export default function ProgramsPage() {
  const t = useTranslations('programs');
  const tPublish = useTranslations('publish');
  const tProto = useTranslations('prototype.admin.nav');
  const state = useProtoState();
  const now = useNow();
  const [editing, setEditing] = useState<{ id?: string; values: ProgramFormValues } | null>(null);
  if (!state) return null;
  const timezone = state.center.timezone;

  return (
    <>
      <PageHeader
        title={tProto('programs')}
        actions={
          <Button onClick={() => setEditing({ values: EMPTY_PROGRAM })}>
            <Plus aria-hidden />
            {t('add')}
          </Button>
        }
      />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {state.programs.map((program) => {
          const instructor = state.staff.find((s) => s.id === program.default_instructor_id);
          const pending =
            program.publish_at && Date.parse(program.publish_at) > now.getTime() ? program.publish_at : null;
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
                {program.description && (
                  <p className="text-sm text-muted-foreground">{program.description}</p>
                )}
                <dl className="grid grid-cols-3 gap-2 text-sm text-muted-foreground">
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
                </dl>
                {pending && (
                  <p className="flex items-center gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-sm text-warning-soft-foreground">
                    <CalendarClock className="size-4 shrink-0" aria-hidden />
                    {tPublish('scheduledAt', { when: formatDateTime(pending, timezone) })}
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {editing && (
        <ProgramSheet
          state={state}
          programId={editing.id}
          initialValues={editing.values}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
