import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { AdminLoginForm } from '@/components/admin/admin-login-form';
import { DevLoginPanel } from '@/components/dev-login-panel';
import { ErrorAlert } from '@/components/form-messages';
import { isAppErrorCode } from '@/lib/errors';
import { safeNext } from '@/lib/safe-redirect';
import { firstParam } from '@/lib/search-params';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.adminLogin');
  return { title: t('title') };
}

export default async function AdminLoginPage({ searchParams }: PageProps<'/admin-login'>) {
  const params = await searchParams;
  // 기본은 첫 화면(/) → 운영자는 /platform, 직원은 /admin 으로 나뉜다
  const next = safeNext(firstParam(params.next), '/');
  const error = firstParam(params.error);
  const t = await getTranslations('auth.adminLogin');

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ErrorAlert code={isAppErrorCode(error) ? error : null} />
      <AdminLoginForm next={next} />
      <p className="text-sm">
        <span className="text-muted-foreground">{t('memberQuestion')} </span>
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('memberAction')}
        </Link>
      </p>
      <DevLoginPanel />
    </div>
  );
}
