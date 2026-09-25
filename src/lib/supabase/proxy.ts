import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { publicEnv } from '@/lib/env';

import type { Database } from './database.types';

/**
 * proxy.ts 에서 요청마다 세션을 갱신하고 JWT 클레임을 돌려준다.
 * createServerClient 와 getClaims 사이에 다른 코드를 넣지 않는다 (Supabase SSR 가이드).
 * 반환된 response 를 그대로 쓰거나, 리다이렉트할 때는 copyCookies 로 갱신된 쿠키를 옮겨야 한다.
 * response 는 getter 라서 나중에 supabase 로 세션을 바꿔도(로컬 개발용 로그인) 새 쿠키가 담긴다.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  return {
    supabase,
    claims: data?.claims ?? null,
    get response() {
      return response;
    },
  };
}

/** 세션 갱신으로 바뀐 쿠키·캐시 헤더를 리다이렉트/리라이트 응답에 옮긴다. */
export function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  const cacheControl = from.headers.get('cache-control');
  if (cacheControl) to.headers.set('cache-control', cacheControl);
  return to;
}
