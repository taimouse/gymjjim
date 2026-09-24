'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { dashboardKeys } from '@/features/dashboard/queries';
import { memberKeys } from '@/features/members/queries';
import { sessionKeys } from '@/features/sessions/queries';
import { createClient } from '@/lib/supabase/client';

import { useAdmin } from './admin-context';

/**
 * Supabase Realtime: 다른 기기(회원 앱·다른 직원)에서 예약이 들어오면
 * 캘린더 숫자·명단·오늘 화면을 새로 불러온다. 짧은 시간에 몰리는 변경은 0.4초 모아서 한 번에 반영.
 */
export function RealtimeSync() {
  const { centerId } = useAdmin();
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const touchedSessions = new Set<string>();

    const flush = () => {
      void queryClient.invalidateQueries({ queryKey: sessionKeys.all });
      for (const id of touchedSessions)
        void queryClient.invalidateQueries({ queryKey: sessionKeys.roster(id) });
      touchedSessions.clear();
      void queryClient.invalidateQueries({ queryKey: memberKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
    };
    const schedule = (sessionId?: unknown) => {
      if (typeof sessionId === 'string') touchedSessions.add(sessionId);
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    };

    const channel = supabase
      .channel(`center-${centerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `center_id=eq.${centerId}` },
        () => schedule(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `center_id=eq.${centerId}` },
        (payload) => {
          const row = (payload.new && 'session_id' in payload.new ? payload.new : payload.old) as {
            session_id?: unknown;
          };
          schedule(row.session_id);
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
