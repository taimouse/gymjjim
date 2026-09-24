'use client';

import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { FieldError } from '@/components/ui/field';
import messages from '@/i18n/messages/ko.json';
import type { AppErrorCode } from '@/lib/errors';
import { cn } from '@/lib/utils';

type ValidationKey = keyof typeof messages.validation;

function isValidationKey(value: unknown): value is ValidationKey {
  return typeof value === 'string' && value in messages.validation;
}

/** Zod 스키마의 에러 메시지(= i18n 키)를 번역해서 보여준다. */
export function ValidationMessage({ error }: { error?: { message?: string } }) {
  const t = useTranslations('validation');
  if (!error) return null;
  return <FieldError>{t(isValidationKey(error.message) ? error.message : 'invalid')}</FieldError>;
}

/** 앱 에러 코드 → 한국어 메시지 */
export function useErrorText() {
  const t = useTranslations('errors');
  return (code: AppErrorCode) => t(code);
}

/** 폼 위쪽에 보여주는 에러 박스 */
export function ErrorAlert({ code, className }: { code: AppErrorCode | null; className?: string }) {
  const errorText = useErrorText();
  if (!code) return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger-soft-foreground',
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{errorText(code)}</span>
    </div>
  );
}
