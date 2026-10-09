'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/client';
import type { Database, Tables } from '@/lib/supabase/database.types';
import type { WithNullable } from '@/lib/types';

import type { CenterStatus, InvoiceStatus } from './schema';

/** 운영자 콘솔 조회. 모두 운영자 RLS·RPC(assert_platform_admin)를 거친다 */
export const platformKeys = {
  all: ['platform'] as const,
  summary: (month: string) => ['platform', 'summary', month] as const,
  centers: (params: CenterListParams) => ['platform', 'centers', params] as const,
  center: (id: string) => ['platform', 'center', id] as const,
  plans: ['platform', 'plans'] as const,
  invoices: (params: InvoiceListParams) => ['platform', 'invoices', params] as const,
};

const summarySchema = z.object({
  month: z.string(),
  centers: z.object({
    trial: z.number().int(),
    active: z.number().int(),
    suspended: z.number().int(),
    closed: z.number().int(),
  }),
  billed: z.number(),
  paid: z.number(),
  unpaid: z.number(),
  overdue_count: z.number().int(),
  overdue_amount: z.number(),
  mrr: z.number(),
  trial_ending: z.array(z.object({ id: z.string(), name: z.string(), trial_ends_at: z.string() })),
});
export type PlatformSummary = z.infer<typeof summarySchema>;

export function usePlatformSummary(month: string) {
  return useQuery({
    queryKey: platformKeys.summary(month),
    queryFn: async () => {
      const { data, error } = await createClient().rpc('platform_summary', { p_month: month });
      if (error) throw error;
      return summarySchema.parse(data);
    },
  });
}

export type PlatformCenterRow = WithNullable<
  Database['public']['Functions']['platform_centers']['Returns'][number],
  | 'address'
  | 'phone'
  | 'trial_ends_at'
  | 'status_changed_at'
  | 'plan_id'
  | 'plan_name'
  | 'monthly_price'
  | 'max_members'
  | 'max_staff'
  | 'owner_name'
  | 'owner_email'
>;

export interface CenterListParams {
  query: string;
  status: CenterStatus | null;
}

export function usePlatformCenters(params: CenterListParams) {
  return useQuery({
    queryKey: platformKeys.centers(params),
    queryFn: async (): Promise<PlatformCenterRow[]> => {
      const { data, error } = await createClient().rpc('platform_centers', {
        p_query: params.query || undefined,
        p_status: params.status ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    placeholderData: keepPreviousData,
  });
}

export function usePlatformCenter(id: string | null) {
  return useQuery({
    queryKey: platformKeys.center(id ?? ''),
    queryFn: async (): Promise<PlatformCenterRow | null> => {
      const { data, error } = await createClient().rpc('platform_centers', { p_center_id: id ?? '' });
      if (error) throw error;
      return data[0] ?? null;
    },
    enabled: !!id,
  });
}

export type PlanRow = Tables<'plans'>;

export function usePlans() {
  return useQuery({
    queryKey: platformKeys.plans,
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await createClient()
        .from('plans')
        .select('*')
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

export interface InvoiceListParams {
  /** 청구 월(1일). 센터 상세에서는 null 로 전체 기간 */
  month: string | null;
  status: InvoiceStatus | null;
  centerId: string | null;
}

export type InvoiceRow = Pick<
  Tables<'invoices'>,
  'id' | 'center_id' | 'period_start' | 'period_end' | 'amount' | 'due_date' | 'status' | 'paid_at' | 'memo'
> & { center: { name: string } | null; plan: { name: string } | null };

export function useInvoices(params: InvoiceListParams) {
  return useQuery({
    queryKey: platformKeys.invoices(params),
    queryFn: async (): Promise<InvoiceRow[]> => {
      let request = createClient()
        .from('invoices')
        .select(
          'id, center_id, period_start, period_end, amount, due_date, status, paid_at, memo, center:centers(name), plan:plans(name)',
        );
      if (params.month) request = request.eq('period_start', params.month);
      if (params.status) request = request.eq('status', params.status);
      if (params.centerId) request = request.eq('center_id', params.centerId);
      const { data, error } = await request
        .order('period_start', { ascending: false })
        .order('due_date')
        .limit(500);
      if (error) throw error;
      return data;
    },
    placeholderData: keepPreviousData,
  });
}
