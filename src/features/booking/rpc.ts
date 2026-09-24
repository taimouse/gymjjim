import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';

import { toAppErrorCode } from '@/lib/errors';
import { fail, ok, type Result } from '@/lib/result';
import type { Database } from '@/lib/supabase/database.types';

import {
  bookSessionInput,
  type BookSessionInput,
  bookSessionResult,
  type BookSessionResult,
  cancelBookingInput,
  type CancelBookingInput,
  cancelBookingResult,
  type CancelBookingResult,
  cancelSessionInput,
  type CancelSessionInput,
  cancelSessionResult,
  type CancelSessionResult,
  createHoldInput,
  type CreateHoldInput,
  createHoldResult,
  type CreateHoldResult,
  setAttendanceInput,
  type SetAttendanceInput,
  setAttendanceResult,
  type SetAttendanceResult,
  staffBookInput,
  type StaffBookInput,
} from './schema';

/**
 * 예약 엔진 RPC 의 타입 안전 래퍼.
 * 입력은 Zod 로 검증하고, DB 에러는 앱 에러 코드로, 결과 jsonb 는 스키마로 검증해서 돌려준다.
 * 브라우저·서버 클라이언트 모두 받을 수 있다 (권한은 DB 가 최종 판단).
 */
type Client = SupabaseClient<Database>;

function toResult<S extends z.ZodType>(data: unknown, error: unknown, schema: S): Result<z.output<S>> {
  if (error) return fail(toAppErrorCode(error));
  const parsed = schema.safeParse(data);
  return parsed.success ? ok(parsed.data) : fail('UNKNOWN');
}

/** 회원 본인 예약. 정원이 차면 대기로 들어간다. */
export async function bookSession(
  client: Client,
  input: BookSessionInput,
): Promise<Result<BookSessionResult>> {
  const parsed = bookSessionInput.safeParse(input);
  if (!parsed.success) return fail('VALIDATION');
  const { data, error } = await client.rpc('book_session', {
    p_session_id: parsed.data.sessionId,
    p_member_pass_id: parsed.data.memberPassId,
  });
  return toResult(data, error, bookSessionResult);
}

/** 관리자 대리 예약 */
export async function staffBookForMember(
  client: Client,
  input: StaffBookInput,
): Promise<Result<BookSessionResult>> {
  const parsed = staffBookInput.safeParse(input);
  if (!parsed.success) return fail('VALIDATION');
  const { data, error } = await client.rpc('staff_book_for_member', {
    p_session_id: parsed.data.sessionId,
    p_member_id: parsed.data.memberId,
    p_override_rules: parsed.data.overrideRules,
    p_allow_over_capacity: parsed.data.allowOverCapacity,
    p_waitlist: parsed.data.waitlist,
    p_member_pass_id: parsed.data.memberPassId,
  });
  return toResult(data, error, bookSessionResult);
}

/** 예약·대기 취소 (무료 취소면 횟수 복구, 아니면 늦은 취소) */
export async function cancelBooking(
  client: Client,
  input: CancelBookingInput,
): Promise<Result<CancelBookingResult>> {
  const parsed = cancelBookingInput.safeParse(input);
  if (!parsed.success) return fail('VALIDATION');
  const { data, error } = await client.rpc('cancel_booking', {
    p_booking_id: parsed.data.bookingId,
    p_waive_penalty: parsed.data.waivePenalty,
  });
  return toResult(data, error, cancelBookingResult);
}

/** 출석·노쇼, 'booked' 로 되돌리기 */
export async function setAttendance(
  client: Client,
  input: SetAttendanceInput,
): Promise<Result<SetAttendanceResult>> {
  const parsed = setAttendanceInput.safeParse(input);
  if (!parsed.success) return fail('VALIDATION');
  const { data, error } = await client.rpc('set_attendance', {
    p_booking_id: parsed.data.bookingId,
    p_status: parsed.data.status,
  });
  return toResult(data, error, setAttendanceResult);
}

/** 폐강 (되돌릴 수 없음) */
export async function cancelSession(
  client: Client,
  input: CancelSessionInput,
): Promise<Result<CancelSessionResult>> {
  const parsed = cancelSessionInput.safeParse(input);
  if (!parsed.success) return fail('VALIDATION');
  const { data, error } = await client.rpc('cancel_session', {
    p_session_id: parsed.data.sessionId,
    p_reason: parsed.data.reason || undefined,
  });
  return toResult(data, error, cancelSessionResult);
}

/** 이용권 정지 + 만료일 연장 */
export async function createHold(client: Client, input: CreateHoldInput): Promise<Result<CreateHoldResult>> {
  const parsed = createHoldInput.safeParse(input);
  if (!parsed.success) return fail('VALIDATION');
  const { data, error } = await client.rpc('create_hold', {
    p_member_pass_id: parsed.data.memberPassId,
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_reason: parsed.data.reason || undefined,
  });
  return toResult(data, error, createHoldResult);
}
