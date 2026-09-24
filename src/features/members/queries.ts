'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { createClient } from '@/lib/supabase/client';
import type { Database, Tables } from '@/lib/supabase/database.types';

import type { MemberFilter, MemberSort } from './schema';

export const memberKeys = {
  all: ['members'] as const,
  search: (centerId: string, params: MemberSearchParams) => ['members', 'search', centerId, params] as const,
  detail: (memberId: string) => ['members', 'detail', memberId] as const,
};

export interface MemberSearchParams {
  query: string;
  filter: MemberFilter;
  sort: MemberSort;
  page: number;
  pageSize: number;
}

export type MemberSearchRow = Database['public']['Functions']['search_members']['Returns'][number];

export async function searchMembers(centerId: string, params: MemberSearchParams) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('search_members', {
    p_center_id: centerId,
    p_query: params.query || undefined,
    p_filter: params.filter,
    p_sort: params.sort,
    p_limit: params.pageSize,
    p_offset: (params.page - 1) * params.pageSize,
  });
  if (error) throw error;
  return { rows: data, total: Number(data[0]?.total_count ?? 0) };
}

export function useMemberSearch(centerId: string, params: MemberSearchParams, enabled = true) {
  return useQuery({
    queryKey: memberKeys.search(centerId, params),
    queryFn: () => searchMembers(centerId, params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export type MemberInfo = Pick<
  Tables<'members'>,
  | 'id'
  | 'name'
  | 'phone'
  | 'birth'
  | 'gender'
  | 'memo'
  | 'tags'
  | 'joined_at'
  | 'user_id'
  | 'notify_enabled'
  | 'marketing_agreed_at'
  | 'privacy_agreed_at'
>;

export type MemberPassRow = Tables<'member_passes'> & {
  holds: Pick<Tables<'pass_holds'>, 'id' | 'start_date' | 'end_date' | 'reason'>[];
};

export interface MemberBookingRow {
  id: string;
  status: Database['public']['Enums']['booking_status'];
  created_at: string;
  session: {
    id: string;
    starts_at: string;
    ends_at: string;
    program: { name: string; color: string } | null;
  } | null;
}

export interface MemberDetail {
  member: MemberInfo;
  passes: MemberPassRow[];
  bookings: MemberBookingRow[];
  stats: Record<Database['public']['Enums']['booking_status'], number>;
}

export async function fetchMemberDetail(memberId: string): Promise<MemberDetail | null> {
  const supabase = createClient();
  const [member, passes, bookings, statuses] = await Promise.all([
    supabase
      .from('members')
      .select(
        'id, name, phone, birth, gender, memo, tags, joined_at, user_id, notify_enabled, marketing_agreed_at, privacy_agreed_at',
      )
      .eq('id', memberId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('member_passes')
      .select('*, holds:pass_holds(id, start_date, end_date, reason)')
      .eq('member_id', memberId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('bookings')
      .select(
        'id, status, created_at, session:sessions(id, starts_at, ends_at, program:programs(name, color))',
      )
      .eq('member_id', memberId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('bookings').select('status').eq('member_id', memberId),
  ]);
  for (const result of [member, passes, bookings, statuses]) if (result.error) throw result.error;
  if (!member.data) return null;

  const stats: MemberDetail['stats'] = {
    booked: 0,
    waitlisted: 0,
    cancelled: 0,
    late_cancelled: 0,
    attended: 0,
    no_show: 0,
  };
  for (const row of statuses.data ?? []) stats[row.status] += 1;

  return {
    member: member.data,
    passes: passes.data ?? [],
    bookings: bookings.data ?? [],
    stats,
  };
}

export function useMemberDetail(memberId: string | null) {
  return useQuery({
    queryKey: memberKeys.detail(memberId ?? ''),
    queryFn: () => fetchMemberDetail(memberId ?? ''),
    enabled: !!memberId,
  });
}
