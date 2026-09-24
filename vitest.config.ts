import path from 'node:path';

import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      // 'server-only'는 React 서버 번들 밖에서 import 하면 예외를 던지므로 테스트에서는 빈 모듈로 대체
      'server-only': path.resolve(root, 'tests/support/empty-module.ts'),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // embedded PostgreSQL 에 마이그레이션·시드를 적용하고 RPC·RLS 를 검증한다 (Docker 불필요)
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/db/global-setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
