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
    ],
  },
});
