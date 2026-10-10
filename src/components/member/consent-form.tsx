'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState, useTransition } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';

import { ErrorAlert, ValidationMessage } from '@/components/form-messages';
import { PrivacyPolicySheet } from '@/components/member/privacy-policy-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import { onboardingSchema, type OnboardingValues } from '@/features/auth/schema';
import type { AppErrorCode } from '@/lib/errors';

type PendingAgree = 'privacy' | 'all';

/**
 * 가입 동의 폼: 개인정보 수집·이용(필수) + 마케팅 수신(선택)
 * 개인정보 처리방침 전문(policy)을 끝까지 스크롤해 확인해야 필수 동의를 체크할 수 있다.
 * 저장은 onSubmit 이 맡는다 (실제 앱: 서버 액션, 프로토타입: 브라우저 저장소). 실패하면 에러 코드를 돌려준다.
 */
export function ConsentForm({
  policy,
  onSubmit: submit,
  privacyHref,
}: {
  policy: ReactNode;
  onSubmit: (values: OnboardingValues) => Promise<AppErrorCode | null>;
  privacyHref?: string;
}) {
  const t = useTranslations('welcome');
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [policyRead, setPolicyRead] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingAgree, setPendingAgree] = useState<PendingAgree | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { privacy: false, marketing: false },
  });
  const [privacy, marketing] = useWatch({ control: form.control, name: ['privacy', 'marketing'] });

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      setError(await submit(values));
    });
  });

  const applyAll = (checked: boolean) => {
    form.setValue('privacy', checked, { shouldValidate: form.formState.isSubmitted });
    form.setValue('marketing', checked);
  };

  /** 처리방침을 아직 다 읽지 않았으면 전문을 먼저 연다 */
  const requireRead = (action: PendingAgree) => {
    if (policyRead) return true;
    setPendingAgree(action);
    setSheetOpen(true);
    return false;
  };

  const toggleAll = (checked: boolean) => {
    if (checked && !requireRead('all')) return;
    applyAll(checked);
  };

  const onPolicyConfirm = () => {
    setPolicyRead(true);
    setSheetOpen(false);
    if (pendingAgree === 'all') applyAll(true);
    if (pendingAgree === 'privacy') form.setValue('privacy', true, { shouldValidate: true });
    setPendingAgree(null);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl bg-muted px-4 font-semibold">
        <Checkbox
          checked={privacy && marketing}
          onCheckedChange={(v) => toggleAll(v === true)}
          className="size-5"
        />
        {t('agreeAll')}
      </label>

      <div className="space-y-3 rounded-xl border p-4">
        <Controller
          control={form.control}
          name="privacy"
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => {
                    if (v === true && !requireRead('privacy')) return;
                    field.onChange(v === true);
                  }}
                  aria-invalid={!!fieldState.error}
                  aria-describedby="privacy-read-state"
                  className="size-5"
                />
                <Badge variant="default">{t('required')}</Badge>
                <span className="font-medium">{t('privacy')}</span>
              </label>
              <ul className="space-y-1 pl-8 text-sm text-muted-foreground">
                <li>{t('privacyItems')}</li>
                <li>{t('privacyPurpose')}</li>
                <li>{t('privacyPeriod')}</li>
              </ul>
              <div className="space-y-2 pl-8">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setSheetOpen(true)}
                >
                  <FileText aria-hidden />
                  {t('privacyView')}
                </Button>
                <p
                  id="privacy-read-state"
                  className={
                    policyRead
                      ? 'flex items-center gap-1.5 text-sm text-success-soft-foreground'
                      : 'text-sm text-muted-foreground'
                  }
                >
                  {policyRead && <CheckCircle2 className="size-4" aria-hidden />}
                  {policyRead ? t('privacyReadDone') : t('privacyReadFirst')}
                </p>
              </div>
              <div className="pl-8">
                <ValidationMessage error={fieldState.error} />
              </div>
            </div>
          )}
        />
        <Controller
          control={form.control}
          name="marketing"
          render={({ field }) => (
            <div className="space-y-1 border-t pt-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  className="size-5"
                />
                <Badge variant="secondary">{t('optional')}</Badge>
                <span className="font-medium">{t('marketing')}</span>
              </label>
              <p className="pl-8 text-sm text-muted-foreground">{t('marketingDetail')}</p>
            </div>
          )}
        />
      </div>

      <ErrorAlert code={error} />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Spinner />}
        {t('submit')}
      </Button>

      <PrivacyPolicySheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setPendingAgree(null);
        }}
        onConfirm={onPolicyConfirm}
        privacyHref={privacyHref}
      >
        {policy}
      </PrivacyPolicySheet>
    </form>
  );
}
