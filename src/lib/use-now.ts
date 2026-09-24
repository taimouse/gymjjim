'use client';

import { useEffect, useState } from 'react';

/** 현재 시각. 일정 간격으로 갱신해서 "예약 마감"·"종료" 같은 시간 의존 표시가 저절로 바뀌게 한다 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
