'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/client';
import type { Database, Tables } from '@/lib/supabase/database.types';
import type { WithNullable } from '@/lib/types';

/** 회원 앱 조회 (member_schedule / preview_booking / member_bookings / repeat_last_week_candidates) */
export const memberBookingKeys = {
  all: ['member-booking'] as const,
  schedule: (centerId: string, date: string) => ['member-booking', 'schedule', centerId, date] as const,
  preview: (sessionId: string) => ['member-booking', 'preview', sessionId] as const,
  mine: (centerId: string, upcoming: boolean) => ['member-booking', 'mine', centerId, upcoming] as const,
  repeat: (centerId: string) => ['member-booking', 'repeat', centerId] as const,
  passes: (memberId: string) => ['member-booking', 'passes', memberId] as const,
};

type Functions = Database['public']['Functions'];

export type ScheduleRow = WithNullable<
  Functions['member_schedule']['Returns'][number],
  'instructor_name' | 'my_booking_id' | 'my_status' | 'my_waitlist_position' | 'my_pass_type'
>;
export type MyBookingRow = WithNullable<
  Functions['member_bookings']['Returns'][number],
  'waitlist_position' | 'cancel_reason' | 'instructor_name' | 'pass_name' | 'pass_type'
>;
export type RepeatCandidate = WithNullable<
  Functions['repeat_last_week_candidates']['Returns'][number],
  'instructor_name'
>;

export function useMemberSchedule(centerId: string, date: string) {
  return useQuery({
    queryKey: memberBookingKeys.schedule(centerId, date),
    queryFn: async (): Promise<ScheduleRow[]> => {
      const { data, error } = await createClient().rpc('member_schedule', {
        p_center_id: centerId,
        p_from: date,
        p_to: date,
      });
      if (error) throw error;
      return data;
    },
  });
}

export const bookingPreviewSchema = z.object({
  pass: z
    .object({
      id: z.uuid(),
      name: z.string(),
      type: z.enum(['period', 'count', 'period_count']),
      remaining_count: z.number().nullable(),
      end_date: z.string().nullable(),
    })
    .nullable(),
  error: z.string().nullable(),
  /** 이 수업 1회 예약에 차감되는 횟수 (횟수권일 때) */
  cost: z.number().int().default(1),
  free_cancel_until: z.string(),
  close_at: z.string(),
});
export type BookingPreview = z.infer<typeof bookingPreviewSchema>;

export function useBookingPreview(sessionId: string | null) {
  return useQuery({
    queryKey: memberBookingKeys.preview(sessionId ?? ''),
    queryFn: async () => {
      const { data, error } = await createClient().rpc('preview_booking', { p_session_id: sessionId ?? '' });
      if (error) throw error;
      return bookingPreviewSchema.parse(data);
    },
    enabled: !!sessionId,
    staleTime: 0,
  });
}

export function useMyBookings(centerId: string, upcoming: boolean) {
  return useQuery({
    queryKey: memberBookingKeys.mine(centerId, upcoming),
    queryFn: async (): Promise<MyBookingRow[]> => {
      const { data, error } = await createClient().rpc('member_bookings', {
        p_center_id: centerId,
        p_upcoming: upcoming,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useRepeatCandidates(centerId: string, enabled: boolean) {
  return useQuery({
    queryKey: memberBookingKeys.repeat(centerId),
    queryFn: async (): Promise<RepeatCandidate[]> => {
      const { data, error } = await createClient().rpc('repeat_last_week_candidates', {
        p_center_id: centerId,
      });
      if (error) throw error;
      return data;
    },
    enabled,
  });
}

/** 내 이용권 (회원 본인 것만 RLS 로 보인다). 예약·취소 뒤 memberBookingKeys.all 로 함께 새로 고친다 */
export type MyPassRow = Pick<
  Tables<'member_passes'>,
  | 'id'
  | 'name'
  | 'type'
  | 'status'
  | 'start_date'
  | 'end_date'
  | 'total_count'
  | 'remaining_count'
  | 'period_limit_count'
  | 'period_limit_unit'
  | 'deleted_at'
> & { holds: Pick<Tables<'pass_holds'>, 'start_date' | 'end_date'>[] };

export function useMyPasses(memberId: string) {
  return useQuery({
    queryKey: memberBookingKeys.passes(memberId),
    queryFn: async (): Promise<MyPassRow[]> => {
      const { data, error } = await createClient()
        .from('member_passes')
        .select(
          'id, name, type, status, start_date, end_date, total_count, remaining_count, period_limit_count, period_limit_unit, deleted_at, holds:pass_holds(start_date, end_date)',
        )
        .eq('member_id', memberId)
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('end_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
  });
}
