'use client';

import { useQuery } from '@tanstack/react-query';

import { createClient } from '@/lib/supabase/client';

export const programKeys = {
  list: (centerId: string) => ['programs', centerId] as const,
};

export interface ProgramItem {
  id: string;
  name: string;
  type: 'group' | 'private';
  default_capacity: number;
  duration_min: number;
  color: string;
  description: string | null;
  default_instructor_id: string | null;
  /** 회원 공개 시각 (null = 공개됨) */
  publish_at: string | null;
  /** 횟수권 차감 횟수 */
  pass_cost: number;
  allowedProductIds: string[];
}

export async function fetchPrograms(centerId: string): Promise<ProgramItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('programs')
    .select(
      'id, name, type, default_capacity, duration_min, color, description, default_instructor_id, publish_at, pass_cost, program_allowed_products(product_id)',
    )
    .eq('center_id', centerId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return data.map(({ program_allowed_products, ...program }) => ({
    ...program,
    allowedProductIds: program_allowed_products.map((row) => row.product_id),
  }));
}

export function useProgramsQuery(centerId: string) {
  return useQuery({ queryKey: programKeys.list(centerId), queryFn: () => fetchPrograms(centerId) });
}
