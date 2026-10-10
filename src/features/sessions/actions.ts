'use server';

import { randomUUID } from 'node:crypto';

import { staffActionContext } from '@/lib/auth/action-context';
import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import { createClient } from '@/lib/supabase/server';

import { expandRecurrence, localToUtc, MAX_OCCURRENCES } from './recurrence';
import {
  sessionCreateSchema,
  type SessionCreateValues,
  sessionMoveSchema,
  type SessionMoveValues,
  sessionPublishSchema,
  type SessionPublishValues,
  sessionUpdateSchema,
  type SessionUpdateValues,
  updateSessionResult,
} from './schema';

/** 공개 예약 입력값(센터 시간대 `yyyy-MM-ddTHH:mm`) → UTC. 빈 값이면 null(바로 공개) */
function publishAtUtc(value: string, timeZone: string): string | null {
  if (!value) return null;
  const [date, time] = value.split('T') as [string, string];
  return localToUtc(date, time, timeZone);
}

/** 수업 만들기 (반복이면 규칙대로 펼쳐 한 번에 저장, 공개 예약 시각 포함) */
export async function createSessions(values: SessionCreateValues): Promise<Result<{ count: number }>> {
  const parsed = sessionCreateSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');

  const occurrences = expandRecurrence({ ...parsed.data, timeZone: context.center.timezone });
  if (occurrences.length === 0 || occurrences.length > MAX_OCCURRENCES) return fail('VALIDATION');
  const groupId = parsed.data.repeat && occurrences.length > 1 ? randomUUID() : null;
  const publishAt = publishAtUtc(parsed.data.publishAt, context.center.timezone);

  const supabase = await createClient();
  const { error } = await supabase.from('sessions').insert(
    occurrences.map((occurrence) => ({
      center_id: context.center.id,
      program_id: parsed.data.programId,
      instructor_id: parsed.data.instructorId,
      starts_at: occurrence.startsAt,
      ends_at: occurrence.endsAt,
      capacity: parsed.data.capacity,
      recurrence_group_id: groupId,
      publish_at: publishAt,
      note: parsed.data.note || null,
      created_by: context.staff.id,
    })),
  );
  if (error) return fail(toAppErrorCode(error));
  return ok({ count: occurrences.length });
}

/** 수업 수정 (이 수업만 / 이후 전체) */
export async function updateSession(
  values: SessionUpdateValues,
): Promise<Result<{ updated: number; notified: number }>> {
  const parsed = sessionUpdateSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');

  const start = new Date(
    localToUtc(parsed.data.date, parsed.data.startTime, context.center.timezone),
  ).getTime();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('update_session', {
    p_session_id: parsed.data.sessionId,
    p_scope: parsed.data.scope,
    p_starts_at: new Date(start).toISOString(),
    p_ends_at: new Date(start + parsed.data.durationMin * 60_000).toISOString(),
    p_instructor_id: parsed.data.instructorId ?? undefined,
    p_clear_instructor: parsed.data.instructorId === null,
    p_capacity: parsed.data.capacity,
    p_note: parsed.data.note,
    p_notify: parsed.data.notify,
  });
  const result = updateSessionResult.safeParse(data);
  if (error || !result.success) return fail(toAppErrorCode(error));
  return ok(result.data);
}

/** 드래그로 시간 이동 */
export async function moveSession(
  values: SessionMoveValues,
): Promise<Result<{ updated: number; notified: number }>> {
  const parsed = sessionMoveSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('update_session', {
    p_session_id: parsed.data.sessionId,
    p_scope: parsed.data.scope,
    p_starts_at: parsed.data.startsAt,
    p_ends_at: parsed.data.endsAt,
    p_notify: parsed.data.notify,
  });
  const result = updateSessionResult.safeParse(data);
  if (error || !result.success) return fail(toAppErrorCode(error));
  return ok(result.data);
}

/** 수업 공개 시각 바꾸기 / 지금 공개 (이 수업만 / 이후 반복 전체) */
export async function setSessionPublishAt(
  values: SessionPublishValues,
): Promise<Result<{ updated: number }>> {
  const parsed = sessionPublishSchema.safeParse(values);
  if (!parsed.success) return fail('VALIDATION');
  const context = await staffActionContext();
  if (!context) return fail('FORBIDDEN');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_session_publish_at', {
    p_session_id: parsed.data.sessionId,
    p_scope: parsed.data.scope,
    p_publish_at: publishAtUtc(parsed.data.publishAt, context.center.timezone) ?? undefined,
  });
  if (error || typeof data !== 'number') return fail(toAppErrorCode(error));
  return ok({ updated: data });
}
