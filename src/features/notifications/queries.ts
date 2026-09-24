'use client';

import { useQuery } from '@tanstack/react-query';

import { createClient } from '@/lib/supabase/client';

/** 설정 > 알림: 최근 발송 내역 (직원 RLS 로 자기 센터만) */
export const notificationKeys = {
  all: ['notifications'] as const,
  logs: (centerId: string, status: LogStatusFilter) => ['notifications', 'logs', centerId, status] as const,
};

export const LOG_STATUS_FILTERS = ['all', 'sent', 'failed', 'pending', 'skipped'] as const;
export type LogStatusFilter = (typeof LOG_STATUS_FILTERS)[number];

const LOG_FIELDS =
  'id, type, status, error, provider, fallback_used, attempts, created_at, sent_at, scheduled_at, member:members!notification_logs_member_fk(name, phone)';

export async function fetchNotificationLogs(centerId: string, status: LogStatusFilter) {
  let query = createClient()
    .from('notification_logs')
    .select(LOG_FIELDS)
    .eq('center_id', centerId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (status === 'pending') query = query.in('status', ['pending', 'sending']);
  else if (status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export type NotificationLogRow = Awaited<ReturnType<typeof fetchNotificationLogs>>[number];

export function useNotificationLogs(centerId: string, status: LogStatusFilter) {
  return useQuery({
    queryKey: notificationKeys.logs(centerId, status),
    queryFn: () => fetchNotificationLogs(centerId, status),
    refetchInterval: 60_000,
  });
}
