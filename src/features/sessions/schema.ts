import { z } from 'zod';

import { END_MODES, FREQUENCIES, MAX_OCCURRENCES, MONTH_WEEKS, MONTHLY_MODES } from './recurrence';

const time = z.string().regex(/^\d{2}:\d{2}$/, { error: 'invalid' });
const dateKey = /^\d{4}-\d{2}-\d{2}$/;

/** 공개 예약 시각 `yyyy-MM-ddTHH:mm` (센터 시간대). 빈 값 = 바로 공개 */
export const publishAtField = z
  .string()
  .refine((value) => value === '' || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value), { error: 'invalid' });

/**
 * 수업 만들기: 프로그램 선택 시 정원·시간 자동 입력
 * 반복: 매주(N주마다·요일) / 매월(같은 날짜 또는 n번째 요일), 종료일 또는 횟수, 제외 날짜
 * 공개 예약: publishAt 부터 회원에게 보인다
 */
export const sessionCreateSchema = z
  .object({
    programId: z.uuid({ error: 'required' }),
    instructorId: z.uuid().nullable(),
    date: z.iso.date({ error: 'required' }),
    startTime: time,
    durationMin: z.number({ error: 'required' }).int().min(5, { error: 'min' }).max(720, { error: 'max' }),
    capacity: z.number({ error: 'required' }).int().min(1, { error: 'min' }).max(500, { error: 'max' }),
    repeat: z.boolean(),
    frequency: z.enum(FREQUENCIES),
    interval: z.number().int().min(1).max(4),
    weekdays: z.array(z.number().int().min(1).max(7)),
    monthlyMode: z.enum(MONTHLY_MODES),
    monthWeeks: z.array(
      z
        .number()
        .int()
        .refine((value) => (MONTH_WEEKS as readonly number[]).includes(value)),
    ),
    endMode: z.enum(END_MODES),
    until: z.string(),
    count: z
      .number({ error: 'required' })
      .int()
      .min(1, { error: 'min' })
      .max(MAX_OCCURRENCES, { error: 'max' }),
    excludeDates: z.array(z.string().regex(dateKey)).max(MAX_OCCURRENCES),
    publishAt: publishAtField,
    note: z.string().trim().max(500, { error: 'max' }),
  })
  .superRefine((values, ctx) => {
    if (values.publishAt && values.publishAt > `${values.date}T${values.startTime}`) {
      ctx.addIssue({ code: 'custom', path: ['publishAt'], message: 'publishAfterStart' });
    }
    if (!values.repeat) return;
    const needsWeekdays = values.frequency === 'weekly' || values.monthlyMode === 'weekday';
    if (needsWeekdays && values.weekdays.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['weekdays'], message: 'required' });
    }
    if (
      values.frequency === 'monthly' &&
      values.monthlyMode === 'weekday' &&
      values.monthWeeks.length === 0
    ) {
      ctx.addIssue({ code: 'custom', path: ['monthWeeks'], message: 'required' });
    }
    if (values.endMode === 'until' && (!dateKey.test(values.until) || values.until < values.date)) {
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

/** 수업 공개 시각 바꾸기 (빈 값 = 지금 공개) */
export const sessionPublishSchema = z.object({
  sessionId: z.uuid(),
  scope: z.enum(SCOPES),
  publishAt: publishAtField,
});
export type SessionPublishValues = z.infer<typeof sessionPublishSchema>;

export const updateSessionResult = z.object({ updated: z.number(), notified: z.number() });
