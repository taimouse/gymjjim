import { type NextRequest, NextResponse } from 'next/server';

import { areaOf, canEnter, parseRoleClaims } from '@/lib/auth/roles';
import { copyCookies, updateSession } from '@/lib/supabase/proxy';

/**
 * 역할별 접근 제어 (Next.js 16 에서 middleware → proxy 로 이름이 바뀌었다)
 *  - 세션 갱신
 *  - 로그인 필요 영역: /admin/* → /admin-login, 그 외 → /login
 *  - JWT 클레임의 소속으로 1차 판단, 권한 없으면 403 페이지
 *  - 최종 권한은 레이아웃(DB 조회)과 RLS·RPC 가 다시 확인한다
 */
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  const area = areaOf(pathname);

  if (area === 'public') return response;

  if (!claims) {
    const loginPath = area === 'admin' ? '/admin-login' : '/login';
    const url = new URL(loginPath, request.url);
    if (area !== 'root') url.searchParams.set('next', `${pathname}${search}`);
    return copyCookies(response, NextResponse.redirect(url));
  }

  const allowed = canEnter(area, parseRoleClaims(claims.app_metadata));
  if (allowed === false) {
    const url = new URL('/403', request.url);
    url.searchParams.set('reason', area);
    return copyCookies(response, NextResponse.rewrite(url, { status: 403 }));
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 파일·이미지·PWA 파일·API(웹훅)는 제외
    '/((?!_next/static|_next/image|api/|favicon.ico|sw.js|swe-worker|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
