'use client';

import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

import { useProtoState } from '../lib/store';
import type { ProtoState } from '../lib/types';

/** 브라우저 저장소를 읽기 전(정적 HTML)에는 스켈레톤, 읽은 뒤에는 화면 */
export function ProtoGate({ children }: { children: (state: ProtoState) => ReactNode }) {
  const state = useProtoState();
  if (!state) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );
  }
  return children(state);
}
