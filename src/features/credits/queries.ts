'use client';

import { useQuery } from '@tanstack/react-query';

import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/lib/supabase/database.types';

import { type MyCredits, myCreditsSchema } from './schema';

/** 크레딧 조회 */
export const creditKeys = {
  /** 직원 화면: 충전·승인·차감 뒤 creditKeys.all 로 함께 새로 고친다 */
  all: ['credits'] as const,
  member: (memberId: string) => ['credits', 'member', memberId] as const,
  pending: (centerId: string) => ['credits', 'pending', centerId] as const,
  /** 회원 앱: 예약·취소 뒤 memberBookingKeys.all 로 함께 새로 고치도록 같은 접두사를 쓴다 */
  mine: (centerId: string) => ['member-booking', 'credits', centerId] as const,
  history: (memberId: string) => ['member-booking', 'credit-history', memberId] as const,
};

export type CreditTransactionRow = Pick<
  Tables<'credit_transactions'>,
  'id' | 'delta' | 'balance_after' | 'reason' | 'memo' | 'created_at'
>;

const TX_COLUMNS = 'id, delta, balance_after, reason, memo, created_at';

async function fetchHistory(memberId: string, limit: number): Promise<CreditTransactionRow[]> {
  const { data, error } = await createClient()
    .from('credit_transactions')
    .select(TX_COLUMNS)
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/** 내 크레딧 (회원): 잔액 · 1개 가격 · 대기 중인 충전 요청 */
export function useMyCredits(centerId: string) {
  return useQuery({
    queryKey: creditKeys.mine(centerId),
    queryFn: async (): Promise<MyCredits> => {
      const { data, error } = await createClient().rpc('my_credits', { p_center_id: centerId });
      if (error) throw error;
      return myCreditsSchema.parse(data);
    },
  });
}

/** 내 크레딧 내역 (회원 본인 것만 RLS 로 보인다) */
export function useMyCreditHistory(memberId: string) {
  return useQuery({
    queryKey: creditKeys.history(memberId),
    queryFn: () => fetchHistory(memberId, 10),
  });
}

export type CreditRequestRow = Pick<
  Tables<'credit_requests'>,
  'id' | 'amount' | 'unit_price' | 'created_at'
> & {
  member: Pick<Tables<'members'>, 'id' | 'name' | 'phone'> | null;
};

/** 대기 중인 충전 요청 (직원: 오늘 화면) */
export function usePendingCreditRequests(centerId: string) {
  return useQuery({
    queryKey: creditKeys.pending(centerId),
    queryFn: async (): Promise<CreditRequestRow[]> => {
      const { data, error } = await createClient()
        .from('credit_requests')
        .select('id, amount, unit_price, created_at, member:members(id, name, phone)')
        .eq('center_id', centerId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export interface MemberCredits {
  balance: number;
  pending: Omit<CreditRequestRow, 'member'> | null;
  history: CreditTransactionRow[];
}

/** 회원 상세의 크레딧 (직원): 잔액 · 대기 중인 요청 · 최근 내역 */
export function useMemberCredits(memberId: string) {
  return useQuery({
    queryKey: creditKeys.member(memberId),
    queryFn: async (): Promise<MemberCredits> => {
      const supabase = createClient();
      const [member, pending, history] = await Promise.all([
        supabase.from('members').select('credit_balance').eq('id', memberId).single(),
        supabase
          .from('credit_requests')
          .select('id, amount, unit_price, created_at')
          .eq('member_id', memberId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        fetchHistory(memberId, 20),
      ]);
      if (member.error) throw member.error;
      if (pending.error) throw pending.error;
      return { balance: member.data.credit_balance, pending: pending.data, history };
    },
  });
}
