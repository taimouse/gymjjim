import { z } from 'zod';

const time = z.string().regex(/^\d{2}:\d{2}$/, { error: 'invalid' });

/** 수업 만들기: 프로그램 선택 시 정원·시간 자동 입력, 반복(요일 + 종료일) */
export const sessionCreateSchema = z
  .object({
    programId: z.uuid({ error: 'required' }),
    instructorId: z.uuid().nullable(),
    date: z.iso.date({ error: 'required' }),
    startTime: time,
    durationMin: z.number({ error: 'required' }).int().min(5, { error: 'min' }).max(720, { error: 'max' }),
    capacity: z.number({ error: 'required' }).int().min(1, { error: 'min' }).max(500, { error: 'max' }),
    repeat: z.boolean(),
    weekdays: z.array(z.number().int().min(1).max(7)),
    until: z.string(),
    note: z.string().trim().max(500, { error: 'max' }),
  })
  .superRefine((values, ctx) => {
    if (!values.repeat) return;
    if (values.weekdays.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'required' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.until) || values.until < values.date) {
      ctx.addIssue({ code: 'custom', path: ['until'], message: 'invalid' });
    }
  });
export type SessionCreateValues = z.infer<typeof sessionCreateSchema>;

export const SCOPES = ['this', 'following'] as const;
export type EditScope = (typeof SCOPES)[number];

/** 수업 수정 (시간·강사·정원·메모) */
export const sessionUpdateSchema = z.object({
  sessionId: z.uuid(),
  scope: z.enum(SCOPES),
  date: z.iso.date({ error: 'required' }),
  startTime: time,
  durationMin: z.number({ error: 'required' }).int().min(5, { error: 'min' }).max(720, { error: 'max' }),
  instructorId: z.uuid().nullable(),
  capacity: z.number({ error: 'required' }).int().min(1, { error: 'min' }).max(500, { error: 'max' }),
  note: z.string().trim().max(500, { error: 'max' }),
  notify: z.boolean(),
});
export type SessionUpdateValues = z.infer<typeof sessionUpdateSchema>;

/** 캘린더에서 드래그로 옮기기 */
export const sessionMoveSchema = z.object({
  sessionId: z.uuid(),
  scope: z.enum(SCOPES),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  notify: z.boolean(),
});
export type SessionMoveValues = z.infer<typeof sessionMoveSchema>;

export const updateSessionResult = z.object({ updated: z.number(), notified: z.number() });
