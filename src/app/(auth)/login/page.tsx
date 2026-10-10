import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { DevLoginPanel } from '@/components/dev-login-panel';
import { ErrorAlert } from '@/components/form-messages';
import { KakaoLoginButton } from '@/components/member/kakao-login-button';
import { MagicLinkForm } from '@/components/member/magic-link-form';
import { FieldSeparator } from '@/components/ui/field';
import { isAppErrorCode } from '@/lib/errors';
import { safeNext } from '@/lib/safe-redirect';
import { firstParam } from '@/lib/search-params';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.memberLogin');
  return { title: t('title') };
}

/** 회원 로그인: 카카오(주) + 이메일 매직링크(보조) */
export default async function MemberLoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = safeNext(firstParam(params.next), '/m');
  const error = firstParam(params.error);
  const t = await getTranslations('auth.memberLogin');

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ErrorAlert code={isAppErrorCode(error) ? error : null} />
      <KakaoLoginButton next={next} />
      <FieldSeparator>{t('or')}</FieldSeparator>
      <MagicLinkForm next={next} />
      <p className="text-sm text-muted-foreground">{t('firstTime')}</p>
      <p className="text-sm">
        <span className="text-muted-foreground">{t('adminQuestion')} </span>
        <Link href="/admin-login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('adminAction')}
        </Link>
      </p>
      <p className="text-sm">
        <Link href="/privacy" className="text-muted-foreground underline underline-offset-4">
          {t('privacyLink')}
        </Link>
      </p>
      <DevLoginPanel />
    </div>
  );
}
