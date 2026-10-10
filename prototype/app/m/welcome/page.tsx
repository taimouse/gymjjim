'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { BrandMark } from '@/components/brand-mark';
import { ConsentForm } from '@/components/member/consent-form';
import { PrivacyPolicy } from '@/components/privacy/privacy-policy';

import { withBase } from '../../../lib/base-path';
import { CENTER } from '../../../lib/seed';
import { protoActions } from '../../../lib/store';

/** 가입 동의: 처리방침 전문을 끝까지 읽어야 필수 동의를 체크할 수 있다 (실제 앱과 같은 폼) */
export default function WelcomePage() {
  const t = useTranslations('welcome');
  const router = useRouter();
  return (
    <div className="space-y-6">
      <BrandMark />
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title', { center: CENTER.name })}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ConsentForm
        policy={<PrivacyPolicy center={CENTER.name} />}
        privacyHref={withBase('/privacy/')}
        onSubmit={async (values) => {
          protoActions.completeOnboarding(values.marketing);
          router.replace('/m/book/');
          return null;
        }}
      />
    </div>
  );
}
