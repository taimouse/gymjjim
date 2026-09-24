'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

/** 회원 앱 조회 (member_schedule / preview_booking / member_bookings / repeat_last_week_candidates) */
export const memberBookingKeys = {
  all: ['member-booking'] as const,
  schedule: (centerId: string, date: string) => ['member-booking', 'schedule', centerId, date] as const,
  preview: (sessionId: string) => ['member-booking', 'preview', sessionId] as const,
  mine: (centerId: string, upcoming: boolean) => ['member-booking', 'mine', centerId, upcoming] as const,
  repeat: (centerId: string) => ['member-booking', 'repeat', centerId] as const,
};

type Functions = Database['public']['Functions'];
/** 타입 생성기는 RPC 의 returns table 컬럼을 모두 non-null 로 만든다. 실제로 null 이 올 수 있는 컬럼을 바로잡는다. */
type WithNullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

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
