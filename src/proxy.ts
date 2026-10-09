import { type NextRequest, NextResponse } from 'next/server';

import { devLoginEnabled, devSignIn, pickDevAccount } from '@/lib/auth/dev-login';
import { areaOf, canEnter, parseRoleClaims } from '@/lib/auth/roles';
import { copyCookies, updateSession } from '@/lib/supabase/proxy';

/**
 * 역할별 접근 제어 (Next.js 16 에서 middleware → proxy 로 이름이 바뀌었다)
 *  - 세션 갱신
 *  - 로그인 필요 영역: /admin/*·/platform/* → /admin-login, 그 외 → /login
 *  - JWT 클레임의 소속으로 1차 판단, 권한 없으면 403 페이지
 *  - 최종 권한은 레이아웃(DB 조회)과 RLS·RPC 가 다시 확인한다
 *  - 로컬 개발 스택(pnpm dev:local)에서는 로그인 없이 시드 계정으로 들어간다 (lib/auth/dev-login)
 */
export async function proxy(request: NextRequest) {
  const session = await updateSession(request);
  const { pathname, search, searchParams } = request.nextUrl;
  const area = areaOf(pathname);

  if (area === 'public') return session.response;

  let { claims } = session;
  if (devLoginEnabled()) {
    const account = pickDevAccount(area, searchParams.get('as'), claims);
    if (account && (await devSignIn(session.supabase, account))) {
      if (searchParams.has('as')) {
        // ?as= 는 떼고, 새 세션 쿠키를 받은 채로 다시 연다
        const url = request.nextUrl.clone();
        url.searchParams.delete('as');
        return copyCookies(session.response, NextResponse.redirect(url));
      }
      claims = (await session.supabase.auth.getClaims()).data?.claims ?? null;
    }
  }

  if (!claims) {
    const loginPath = area === 'admin' || area === 'platform' ? '/admin-login' : '/login';
    const url = new URL(loginPath, request.url);
    if (area !== 'root') url.searchParams.set('next', `${pathname}${search}`);
    return copyCookies(session.response, NextResponse.redirect(url));
  }

  const allowed = canEnter(area, parseRoleClaims(claims.app_metadata));
  if (allowed === false) {
    const url = new URL('/403', request.url);
    url.searchParams.set('reason', area);
    return copyCookies(session.response, NextResponse.rewrite(url, { status: 403 }));
  }

  return session.response;
}

export const config = {
  matcher: [
    // 정적 파일·이미지·PWA 파일(서비스 워커·매니페스트·아이콘·오프라인 안내)·API(웹훅)는 제외
    '/((?!_next/static|_next/image|api/|favicon.ico|serwist/|manifest.webmanifest|icons/|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
