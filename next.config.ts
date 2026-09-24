import { withSerwist } from '@serwist/turbopack';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

// Serwist(PWA): 서비스 워커는 src/app/serwist/[path]/route.ts 가 빌드한다
export default withSerwist(withNextIntl(nextConfig));
