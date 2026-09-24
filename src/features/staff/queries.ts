'use client';

import { useQuery } from '@tanstack/react-query';

import { createClient } from '@/lib/supabase/client';

export const staffKeys = {
  list: (centerId: string) => ['staff', centerId] as const,
};

export interface StaffItem {
  id: string;
  name: string;
  role: 'owner' | 'staff';
  color: string;
  email: string | null;
  phone: string | null;
  user_id: string | null;
  invited_at: string | null;
}

export async function fetchStaff(centerId: string): Promise<StaffItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('staff')
    .select('id, name, role, color, email, phone, user_id, invited_at')
    .eq('center_id', centerId)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw error;
  return data;
}

export function useStaffQuery(centerId: string) {
  return useQuery({ queryKey: staffKeys.list(centerId), queryFn: () => fetchStaff(centerId) });
}
