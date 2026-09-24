import { getTranslations } from 'next-intl/server';

// STEP 4에서 로그인 상태·역할에 따라 /admin 또는 /m 으로 보내는 진입점으로 바뀐다.
export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground">{t('subtitle')}</p>
    </main>
  );
}
