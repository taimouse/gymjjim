'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { dashboardKeys } from '@/features/dashboard/queries';

/**
 * 수업·회원 데이터가 바뀌면(무효화되면) 오늘 화면 숫자·목록도 다시 불러온다.
 * 세션 드로어의 출석 체크, 이용권 부여처럼 여러 곳의 변경을 한 군데서 받는다.
 */
export function useDashboardRefresh() {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'invalidate') return;
        const root = event.query.queryKey[0];
        if (root === 'sessions' || root === 'members') {
          void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
        }
      }),
    [queryClient],
  );
}
