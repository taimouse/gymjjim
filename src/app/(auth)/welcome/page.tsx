import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { OnboardingForm } from '@/components/member/onboarding-form';
import { PrivacyPolicy } from '@/components/privacy/privacy-policy';
import { requireMember } from '@/lib/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('welcome');
  return { title: t('submit') };
}

/** 회원 첫 로그인 동의 화면 */
export default async function WelcomePage() {
  const membership = await requireMember({ allowNotOnboarded: true });
  if (membership.onboarded_at) redirect('/m');
  const t = await getTranslations('welcome');

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">{t('title', { center: membership.center_name })}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>
      <OnboardingForm policy={<PrivacyPolicy center={membership.center_name} />} />
    </div>
  );
}
