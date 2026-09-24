import { type NextRequest, NextResponse } from 'next/server';

import { safeNext } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

/** OAuth(카카오) PKCE 콜백: code → 세션 교환 후 next 로 이동 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'), '/');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const failure = new URL('/login', request.url);
  failure.searchParams.set('error', 'AUTH_LINK_INVALID');
  failure.searchParams.set('next', next);
  return NextResponse.redirect(failure);
}
