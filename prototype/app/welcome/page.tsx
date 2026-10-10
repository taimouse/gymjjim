'use client';

import { useTranslations } from 'next-intl';

import { BrandMark } from '@/components/brand-mark';
import { OnboardingForm } from '@/components/member/onboarding-form';
import { PrivacyPolicy } from '@/components/privacy/privacy-policy';
import { Skeleton } from '@/components/ui/skeleton';

import { ProtoBanner } from '../../components/proto-banner';
import { useMounted } from '../../lib/use-mounted';
import { currentCenter } from '../../mock/session';

function Welcome() {
  const t = useTranslations('welcome');
  const center = String(currentCenter().name);
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title', { center })}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>
      <OnboardingForm policy={<PrivacyPolicy center={center} />} />
    </div>
  );
}

/** 첫 로그인 동의 (src/app/(auth)/welcome · (auth)/layout 과 같은 구성) */
export default function WelcomePage() {
  const mounted = useMounted();
  return (
    <>
      <ProtoBanner />
      <main className="flex min-h-dvh justify-center bg-surface px-4 py-10 sm:items-center">
        <div className="w-full max-w-sm space-y-8">
          <BrandMark />
          {mounted ? <Welcome /> : <Skeleton className="h-96 rounded-xl" />}
        </div>
      </main>
    </>
  );
}
