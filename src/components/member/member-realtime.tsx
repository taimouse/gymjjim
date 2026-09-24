'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { memberBookingKeys } from '@/features/booking/queries';
import { createClient } from '@/lib/supabase/client';

import { useMember } from './member-context';

/** 다른 회원의 예약으로 잔여석이 바뀌면 수업 목록을 새로 불러온다 (Supabase Realtime) */
export function MemberRealtime() {
  const { centerId } = useMember();
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`member-center-${centerId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `center_id=eq.${centerId}` },
        () => {
          clearTimeout(timer);
          timer = setTimeout(
            () => void queryClient.invalidateQueries({ queryKey: memberBookingKeys.all }),
            400,
          );
        },
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [centerId, queryClient]);

  return null;
}
