import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { toAppErrorCode } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

const acceptResult = z.object({ member_id: z.uuid(), center_id: z.uuid(), onboarded: z.boolean() });

/** 로그인한 사용자를 초대받은 회원과 연결한다. 연결 후 역할 클레임을 새로 받기 위해 세션을 갱신한다. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const invitePage = new URL(`/invite/${encodeURIComponent(token)}`, request.url);
  if (!/^[0-9a-f]{64}$/.test(token)) return NextResponse.redirect(invitePage);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) return NextResponse.redirect(invitePage);

  const { data, error } = await supabase.rpc('accept_member_invite', { p_token: token });
  const parsed = acceptResult.safeParse(data);
  if (error || !parsed.success) {
    invitePage.searchParams.set('error', toAppErrorCode(error));
    return NextResponse.redirect(invitePage);
  }

  await supabase.auth.refreshSession();
  return NextResponse.redirect(new URL(parsed.data.onboarded ? '/m' : '/welcome', request.url));
}
