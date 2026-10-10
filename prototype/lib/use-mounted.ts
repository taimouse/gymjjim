'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/** 브라우저에서 그린 뒤에만 true (정적 HTML 에는 브라우저 저장소 데이터가 없으므로 그때까지는 스켈레톤) */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
