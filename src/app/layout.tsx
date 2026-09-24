import { SerwistProvider } from '@serwist/turbopack/react';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

import { Providers } from '@/components/providers';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return {
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('description'),
    applicationName: t('name'),
    // 홈 화면에 추가 (iOS 는 매니페스트 대신 이 값을 쓴다)
    appleWebApp: { capable: true, title: t('name'), statusBarStyle: 'default' },
    icons: { icon: '/icons/192', apple: '/icons/apple' },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0e12' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko">
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          {/* PWA 서비스 워커: 개발 중에는 캐시 때문에 헷갈리지 않도록 끈다 */}
          <SerwistProvider
            swUrl="/serwist/sw.js"
            disable={process.env.NODE_ENV === 'development'}
            reloadOnOnline={false}
          >
            <Providers>{children}</Providers>
          </SerwistProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
