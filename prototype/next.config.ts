import path from 'node:path';

import type { NextConfig } from 'next';

/**
 * GitHub Pages 용 정적 프로토타입 (DB 없이 브라우저 저장소로 동작)
 * - `pnpm proto:build` → prototype/out 에 정적 파일
 * - Pages 는 https://<owner>.github.io/<repo>/ 아래에 올라가므로 basePath 를 PAGES_BASE_PATH 로 받는다
 * - 실제 앱(src/)의 화면 컴포넌트·디자인 토큰·문구를 그대로 가져다 쓴다
 */
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    // publicEnv() 검증을 통과시키기 위한 값 (실제로 접속하지 않는다)
    NEXT_PUBLIC_SUPABASE_URL: 'https://prototype.invalid',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'prototype',
    NEXT_PUBLIC_SITE_URL: 'https://prototype.invalid',
  },
  // 저장소 루트까지 열어 두어야 ../src 를 가져올 수 있다
  turbopack: {
    root: path.resolve(import.meta.dirname, '..'),
    // 실제 앱 화면은 그대로 두고 DB·서버 의존 모듈만 브라우저용 가짜로 바꾼다 (prototype/mock)
    resolveAlias: {
      '@/lib/supabase/client': './mock/supabase-client.ts',
      '@/lib/supabase/server': './mock/supabase-server.ts',
      '@/lib/supabase/admin': './mock/supabase-admin.ts',
      '@/lib/auth/action-context': './mock/action-context.ts',
      '@/lib/env.server': './mock/env-server.ts',
      '@/features/auth/actions': './mock/auth-actions.ts',
      'node:crypto': './mock/node-crypto.ts',
    },
    // 서버 액션 파일의 'use server' 를 떼서 브라우저에서 실행한다
    rules: {
      '*.ts': {
        condition: { path: /src\/features\/[^/]+\/(actions|invite)\.ts$/ },
        loaders: [path.resolve(import.meta.dirname, 'scripts/strip-use-server.cjs')],
        as: '*.ts',
      },
    },
  },
};

export default nextConfig;
