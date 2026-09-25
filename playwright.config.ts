import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

// Supabase 주소·키: 도커 없는 로컬 스택(pnpm dev:local)이 켜져 있으면 그 값을, 아니면 .env.local 을 쓴다
// (먼저 읽은 값이 남는다. 픽스처는 서비스 키로 만든다)
if (existsSync('.cache/dev-stack.env')) process.loadEnvFile('.cache/dev-stack.env');
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

// 설치된 브라우저로 돌릴 때: E2E_BROWSER_CHANNEL=msedge 또는 chrome (Playwright 브라우저를 받지 않아도 된다)
const channel = process.env.E2E_BROWSER_CHANNEL || undefined;

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
      use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'member-mobile',
      testMatch: /member\..*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel,
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
