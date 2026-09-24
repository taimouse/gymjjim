'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const PARAM = 'member';

/**
 * 회원 상세 드로어는 URL 의 ?member=<id> 로 연다.
 * 어느 관리자 화면에서든(⌘K 포함) 같은 방식으로 열 수 있고, 새로고침·뒤로가기도 자연스럽다.
 */
export function useMemberDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const memberId = searchParams.get(PARAM);

  const open = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(PARAM, id);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return { memberId, open, close };
}
