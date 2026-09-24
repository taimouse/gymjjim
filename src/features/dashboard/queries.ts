'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { WithNullable } from '@/lib/types';

/** 관리자 "오늘" 화면 조회 (today_summary / today_followups / center_stats) */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  summary: (centerId: string) => ['dashboard', 'summary', centerId] as const,
  followups: (centerId: string) => ['dashboard', 'followups', centerId] as const,
  stats: (centerId: string, period: StatsPeriod) => ['dashboard', 'stats', centerId, period] as const,
};

export const todaySummarySchema = z.object({
  date: z.string(),
  bookings: z.number().int(),
  attended: z.number().int(),
  attendance_base: z.number().int(),
  new_members: z.number().int(),
  renewals: z.number().int(),
});
export type TodaySummary = z.infer<typeof todaySummarySchema>;

/** 출석률(%) — 아직 시작한 수업이 없으면 null */
export function attendanceRate(summary: Pick<TodaySummary, 'attended' | 'attendance_base'>): number | null {
  if (summary.attendance_base === 0) return null;
  return Math.round((summary.attended / summary.attendance_base) * 100);
}

export function useTodaySummary(centerId: string) {
  return useQuery({
    queryKey: dashboardKeys.summary(centerId),
    queryFn: async () => {
      const { data, error } = await createClient().rpc('today_summary', { p_center_id: centerId });
      if (error) throw error;
      return todaySummarySchema.parse(data);
    },
  });
}

type Functions = Database['public']['Functions'];
export const FOLLOWUP_REASONS = ['expiring', 'low', 'inactive'] as const;
export type FollowupReason = (typeof FOLLOWUP_REASONS)[number];
export type FollowupRow = WithNullable<
  Functions['today_followups']['Returns'][number],
  'phone' | 'pass_id' | 'pass_name' | 'days_left' | 'remaining' | 'last_attended_at'
>;

export function useFollowups(centerId: string) {
  return useQuery({
    queryKey: dashboardKeys.followups(centerId),
    queryFn: async (): Promise<FollowupRow[]> => {
      const { data, error } = await createClient().rpc('today_followups', { p_center_id: centerId });
      if (error) throw error;
      return data;
    },
  });
}

/** 주간 = 최근 7일(일별), 월간 = 최근 6개월(월별) */
export type StatsPeriod = 'week' | 'month';
const PERIOD_ARGS = {
  week: { p_unit: 'day', p_count: 7 },
  month: { p_unit: 'month', p_count: 6 },
} as const satisfies Record<StatsPeriod, { p_unit: string; p_count: number }>;

export type StatsRow = Functions['center_stats']['Returns'][number];

export function useCenterStats(centerId: string, period: StatsPeriod) {
  return useQuery({
    queryKey: dashboardKeys.stats(centerId, period),
    queryFn: async (): Promise<StatsRow[]> => {
      const { data, error } = await createClient().rpc('center_stats', {
        p_center_id: centerId,
        ...PERIOD_ARGS[period],
      });
      if (error) throw error;
      return data;
    },
  });
}
