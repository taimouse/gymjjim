import { useTranslations } from 'next-intl';

/** 키보드 사용자가 메뉴를 건너뛰고 본문(#main)으로 바로 가는 링크. Tab 을 누르면 보인다 */
export function SkipLink() {
  const t = useTranslations('app');
  return (
    <a
      href="#main"
      className="sr-only rounded-lg bg-background px-4 py-3 font-semibold text-foreground shadow-lg outline-none focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {t('skipToContent')}
    </a>
  );
}
