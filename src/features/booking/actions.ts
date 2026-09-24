'use server';

import { createClient } from '@/lib/supabase/server';

import * as rpc from './rpc';
import type {
  BookSessionInput,
  CancelBookingInput,
  CancelSessionInput,
  SetAttendanceInput,
  StaffBookInput,
} from './schema';

/**
 * 예약 엔진 서버 액션. 입력 검증·권한 판단은 rpc 래퍼(Zod)와 DB 함수(RPC)가 한다.
 * 브라우저에서 직접 RPC 를 부르지 않고 서버를 거치게 해서 입력을 한 번 더 검증한다.
 */

export async function bookSessionAction(input: BookSessionInput) {
  return rpc.bookSession(await createClient(), input);
}

export async function cancelBookingAction(input: CancelBookingInput) {
  return rpc.cancelBooking(await createClient(), input);
}

export async function staffBookAction(input: StaffBookInput) {
  return rpc.staffBookForMember(await createClient(), input);
}

export async function setAttendanceAction(input: SetAttendanceInput) {
  return rpc.setAttendance(await createClient(), input);
}

export async function cancelSessionAction(input: CancelSessionInput) {
  return rpc.cancelSession(await createClient(), input);
}
