import { LinkIcon, TicketX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { ErrorAlert } from '@/components/form-messages';
import { KakaoLoginButton } from '@/components/member/kakao-login-button';
import { MagicLinkForm } from '@/components/member/magic-link-form';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { FieldSeparator } from '@/components/ui/field';
import { inviteInfoSchema } from '@/features/auth/schema';
import { getClaims } from '@/lib/auth/session';
import { isAppErrorCode } from '@/lib/errors';
import { firstParam } from '@/lib/search-params';
import { createClient } from '@/lib/supabase/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('invite');
  return { title: t('connect'), robots: { index: false } };
}

/** 초대 링크: 센터·회원 확인 → 로그인 → /auth/accept-invite 에서 회원 연결 */
export default async function InvitePage({ params, searchParams }: PageProps<'/invite/[token]'>) {
  const { token } = await params;
  const error = firstParam((await searchParams).error);
  const t = await getTranslations('invite');
  const tLogin = await getTranslations('auth.memberLogin');

  const supabase = await createClient();
  const { data } = await supabase.rpc('get_invite', { p_token: token });
  const parsed = inviteInfoSchema.safeParse(data);
  const invite = parsed.success ? parsed.data : ({ status: 'invalid' } as const);

  if (invite.status !== 'valid') {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TicketX aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t(invite.status)}</EmptyTitle>
          <EmptyDescription>{t('askCenter')}</EmptyDescription>
        </EmptyHeader>
        <Button asChild variant="outline">
          <Link href="/">{t('goHome')}</Link>
        </Button>
      </Empty>
    );
  }

  const acceptPath = `/auth/accept-invite?token=${encodeURIComponent(token)}`;
  const claims = await getClaims();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{t('title', { center: invite.center_name })}</h1>
        <p className="text-muted-foreground">{t('greeting', { name: invite.member_name })}</p>
      </header>
      <ErrorAlert code={isAppErrorCode(error) ? error : null} />
      {claims ? (
        <Button asChild size="lg" className="w-full">
          <a href={acceptPath}>
            <LinkIcon aria-hidden />
            {t('connect')}
          </a>
        </Button>
      ) : (
        <div className="space-y-4">
          <p className="font-medium">{t('loginToConnect')}</p>
          <KakaoLoginButton next={acceptPath} />
          <FieldSeparator>{tLogin('or')}</FieldSeparator>
          <MagicLinkForm next={acceptPath} />
        </div>
      )}
    </div>
  );
}
