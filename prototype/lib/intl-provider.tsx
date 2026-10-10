'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import { APP_LOCALE, APP_TIME_ZONE } from '@/i18n/config';
import messages from '@/i18n/messages/ko.json';

/** 정적 export 라 서버 요청 설정 없이 클라이언트에서 문구를 넣는다 */
export function IntlProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={APP_LOCALE} timeZone={APP_TIME_ZONE} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
