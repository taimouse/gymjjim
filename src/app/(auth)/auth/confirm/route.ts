import type { EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

import { safeNext } from '@/lib/safe-redirect';
import { createClient } from '@/lib/supabase/server';

const OTP_TYPES: readonly EmailOtpType[] = [
  'email',
  'magiclink',
  'invite',
  'recovery',
  'signup',
  'email_change',
];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * 메일 링크(매직링크·직원 초대) 확인. token_hash 방식이라 메일 앱 내장 브라우저에서 열어도 된다.
 * 메일 템플릿: {{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = safeNext(searchParams.get('next'), '/');

  if (tokenHash && isOtpType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const failure = new URL(type === 'invite' ? '/admin-login' : '/login', request.url);
  failure.searchParams.set('error', 'AUTH_LINK_INVALID');
  return NextResponse.redirect(failure);
}
