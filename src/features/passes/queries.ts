'use client';

import { useQuery } from '@tanstack/react-query';

import type { Tables } from '@/lib/supabase/database.types';
import { createClient } from '@/lib/supabase/client';

export const productKeys = {
  list: (centerId: string) => ['pass-products', centerId] as const,
};

export type ProductItem = Pick<
  Tables<'pass_products'>,
  | 'id'
  | 'name'
  | 'type'
  | 'duration_days'
  | 'total_count'
  | 'period_limit_count'
  | 'period_limit_unit'
  | 'price'
  | 'is_active'
>;

export async function fetchProducts(centerId: string): Promise<ProductItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('pass_products')
    .select(
      'id, name, type, duration_days, total_count, period_limit_count, period_limit_unit, price, is_active',
    )
    .eq('center_id', centerId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('created_at');
  if (error) throw error;
  return data;
}

export function useProductsQuery(centerId: string) {
  return useQuery({ queryKey: productKeys.list(centerId), queryFn: () => fetchProducts(centerId) });
}
