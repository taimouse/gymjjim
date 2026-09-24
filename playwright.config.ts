import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

// 로컬 Supabase 주소·키를 앱과 같은 .env.local 에서 읽는다 (픽스처는 서비스 키로 만든다)
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// E2E는 로컬 Supabase(`pnpm supabase start` + `pnpm supabase db reset`)가 떠 있어야 한다.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'admin-desktop',
      testMatch: /admin\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'member-mobile',
      testMatch: /member\..*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        port: PORT,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
