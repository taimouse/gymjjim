'use client';

import type { ReactNode } from 'react';

import { ConsentForm } from '@/components/member/consent-form';
import { completeOnboarding } from '@/features/auth/actions';

/** 첫 로그인 동의 (저장: complete_onboarding RPC) */
export function OnboardingForm({ policy }: { policy: ReactNode }) {
  return (
    <ConsentForm
      policy={policy}
      onSubmit={async (values) => {
        const result = await completeOnboarding(values);
        return result.ok ? null : result.code;
      }}
    />
  );
}
