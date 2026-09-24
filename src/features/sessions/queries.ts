'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

export const sessionKeys = {
  all: ['sessions'] as const,
  range: (centerId: string, from: string, to: string) => ['sessions', 'range', centerId, from, to] as const,
  roster: (sessionId: string) => ['sessions', 'roster', sessionId] as const,
};

export interface CalendarSession {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked_count: number;
  waitlist_count: number;
  status: 'scheduled' | 'cancelled';
  note: string | null;
  recurrence_group_id: string | null;
  cancel_reason: string | null;
  program: { id: string; name: string; color: string; duration_min: number } | null;
  instructor: { id: string; name: string; color: string } | null;
}

const SESSION_FIELDS =
  'id, starts_at, ends_at, capacity, booked_count, waitlist_count, status, note, recurrence_group_id, cancel_reason, program:programs(id, name, color, duration_min), instructor:staff!sessions_instructor_fk(id, name, color)';

/** [from, to) 범위의 수업 (캘린더 보이는 구간) */
export async function fetchSessions(centerId: string, from: string, to: string): Promise<CalendarSession[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_FIELDS)
    .eq('center_id', centerId)
    .is('deleted_at', null)
    .gte('starts_at', from)
    .lt('starts_at', to)
    .order('starts_at');
  if (error) throw error;
  return data;
}

export function useSessionsInRange(centerId: string, from: string | null, to: string | null) {
  return useQuery({
    queryKey: sessionKeys.range(centerId, from ?? '', to ?? ''),
    queryFn: () => fetchSessions(centerId, from ?? '', to ?? ''),
    enabled: !!from && !!to,
    placeholderData: keepPreviousData,
  });
}

export async function fetchSession(sessionId: string): Promise<CalendarSession | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('sessions')
    .select(SESSION_FIELDS)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: [...sessionKeys.all, 'one', sessionId ?? ''],
    queryFn: () => fetchSession(sessionId ?? ''),
    enabled: !!sessionId,
  });
}

export interface RosterBooking {
  id: string;
  status: Database['public']['Enums']['booking_status'];
  waitlist_position: number | null;
  booked_by: Database['public']['Enums']['booked_by'];
  created_at: string;
  cancelled_at: string | null;
  member: { id: string; name: string; phone: string | null } | null;
  pass: { name: string; remaining_count: number | null } | null;
}

/** 수업 예약자·대기자 명단 */
export async function fetchRoster(sessionId: string): Promise<RosterBooking[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, status, waitlist_position, booked_by, created_at, cancelled_at, member:members(id, name, phone), pass:member_passes!bookings_pass_center_fk(name, remaining_count)',
    )
    .eq('session_id', sessionId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export function useSessionRoster(sessionId: string | null) {
  return useQuery({
    queryKey: sessionKeys.roster(sessionId ?? ''),
    queryFn: () => fetchRoster(sessionId ?? ''),
    enabled: !!sessionId,
  });
}
