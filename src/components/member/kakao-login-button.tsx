'use client';

import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';

import { Spinner } from '@/components/ui/spinner';
import { signInWithKakao } from '@/features/auth/actions';

function KakaoSymbol() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3C6.48 3 2 6.48 2 10.8c0 2.78 1.86 5.22 4.66 6.6l-.95 3.48c-.08.3.26.54.52.37l4.12-2.72c.54.07 1.09.11 1.65.11 5.52 0 10-3.48 10-7.8S17.52 3 12 3z"
      />
    </svg>
  );
}

function SubmitButton() {
  const t = useTranslations('auth.memberLogin');
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-kakao text-base font-semibold text-kakao-foreground transition-opacity outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
    >
      {pending ? <Spinner className="size-5" /> : <KakaoSymbol />}
      {t('kakao')}
    </button>
  );
}

/** 카카오 로그인 (Supabase Kakao provider). next: 로그인 후 이동할 경로 */
export function KakaoLoginButton({ next }: { next: string }) {
  return (
    <form action={signInWithKakao}>
      <input type="hidden" name="next" value={next} />
      <SubmitButton />
    </form>
  );
}
