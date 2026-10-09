'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/client';

export const centerKeys = {
  planUsage: (centerId: string) => ['centers', 'plan-usage', centerId] as const,
};

const planUsageSchema = z.object({
  status: z.enum(['trial', 'active', 'suspended', 'closed']),
  trial_ends_at: z.string().nullable(),
  plan_name: z.string().nullable(),
  monthly_price: z.number().nullable(),
  max_members: z.number().int().nullable(),
  max_staff: z.number().int().nullable(),
  member_count: z.number().int(),
  staff_count: z.number().int(),
});
export type CenterPlanUsage = z.infer<typeof planUsageSchema>;

/** 우리 센터의 요금제와 회원·직원 사용량 (직원 누구나) */
export function useCenterPlanUsage(centerId: string) {
  return useQuery({
    queryKey: centerKeys.planUsage(centerId),
    queryFn: async () => {
      const { data, error } = await createClient().rpc('center_plan_usage', { p_center_id: centerId });
      if (error) throw error;
      return planUsageSchema.parse(data);
    },
  });
}
