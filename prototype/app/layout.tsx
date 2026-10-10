import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

import { Providers } from '@/components/providers';
import messages from '@/i18n/messages/ko.json';

import { IntlProvider } from '../lib/intl-provider';

export const metadata: Metadata = {
  title: { default: messages.prototype.title, template: `%s · ${messages.app.name}` },
  description: messages.prototype.description,
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh">
        <IntlProvider>
          <Providers>{children}</Providers>
        </IntlProvider>
      </body>
    </html>
  );
}
