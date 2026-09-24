import { z } from 'zod';

/** 예약 엔진 RPC 입력·출력 스키마. 서버 액션과 화면 폼이 같은 스키마를 쓴다. */

const dateKey = z.iso.date();

export const bookSessionInput = z.object({
  sessionId: z.uuid(),
  memberPassId: z.uuid().optional(),
});
export type BookSessionInput = z.infer<typeof bookSessionInput>;

/** "지난주와 같은 수업" 일괄 예약: 한 번에 최대 20개 */
export const bookManyInput = z.array(z.uuid()).min(1).max(20);

export const cancelBookingInput = z.object({
  bookingId: z.uuid(),
  waivePenalty: z.boolean().default(false),
});
export type CancelBookingInput = z.input<typeof cancelBookingInput>;

export const attendanceStatus = z.enum(['attended', 'no_show', 'booked']);
export type AttendanceStatus = z.infer<typeof attendanceStatus>;

export const setAttendanceInput = z.object({
  bookingId: z.uuid(),
  status: attendanceStatus,
});
export type SetAttendanceInput = z.infer<typeof setAttendanceInput>;

export const staffBookInput = z.object({
  sessionId: z.uuid(),
  memberId: z.uuid(),
  overrideRules: z.boolean().default(false),
  allowOverCapacity: z.boolean().default(false),
  waitlist: z.boolean().default(false),
  memberPassId: z.uuid().optional(),
});
export type StaffBookInput = z.input<typeof staffBookInput>;

export const cancelSessionInput = z.object({
  sessionId: z.uuid(),
  reason: z.string().trim().max(200).optional(),
});
export type CancelSessionInput = z.infer<typeof cancelSessionInput>;

export const createHoldInput = z
  .object({
    memberPassId: z.uuid(),
    startDate: dateKey,
    endDate: dateKey,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((value) => value.endDate >= value.startDate, { path: ['endDate'], message: 'INVALID_DATE_RANGE' });
export type CreateHoldInput = z.infer<typeof createHoldInput>;

/* ───────────── RPC 결과 (DB 가 돌려주는 jsonb) ───────────── */

export const bookSessionResult = z.object({
  booking_id: z.uuid(),
  status: z.enum(['booked', 'waitlisted']),
  waitlist_position: z.number().int().nullable(),
  member_pass_id: z.uuid(),
  remaining_count: z.number().int().nullable(),
});
export type BookSessionResult = z.infer<typeof bookSessionResult>;

export const cancelBookingResult = z.object({
  booking_id: z.uuid(),
  status: z.enum(['cancelled', 'late_cancelled']),
  restored: z.boolean(),
  promoted: z.array(z.uuid()),
});
export type CancelBookingResult = z.infer<typeof cancelBookingResult>;

export const setAttendanceResult = z.object({
  booking_id: z.uuid(),
  status: attendanceStatus,
  previous_status: attendanceStatus,
});
export type SetAttendanceResult = z.infer<typeof setAttendanceResult>;

export const cancelSessionResult = z.object({
  session_id: z.uuid(),
  restored_count: z.number().int(),
  affected: z.array(
    z.object({
      booking_id: z.uuid(),
      member_id: z.uuid(),
      member_name: z.string(),
      previous_status: z.enum(['booked', 'waitlisted']),
    }),
  ),
});
export type CancelSessionResult = z.infer<typeof cancelSessionResult>;

export const createHoldResult = z.object({
  hold_id: z.uuid(),
  days: z.number().int(),
  previous_end_date: dateKey.nullable(),
  new_end_date: dateKey.nullable(),
});
export type CreateHoldResult = z.infer<typeof createHoldResult>;
