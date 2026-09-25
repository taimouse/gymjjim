import { expect, test } from '@playwright/test';

import { messages } from './support/messages';
import { COACH, loginAsOwner, OWNER } from './support/supabase';

// 도커 없는 로컬 스택(pnpm dev:local)만 켜는 기능이라 그때만 돌린다
test.skip(process.env.GYMJJIM_DEV_LOGIN !== '1', '로컬 개발 스택(pnpm dev:local)에서만 확인한다');

test.describe('(6) 로컬 스택: 로그인 없이 둘러보기', () => {
  test('주소만 열면 시드 계정으로 들어가고, 관리자·회원 화면을 오갈 때 계정이 바뀐다', async ({ page }) => {
    const account = page.getByRole('button', { name: messages.admin.topbar.account });

    await page.goto('/admin/members');
    await expect(page).toHaveURL(/\/admin\/members$/);
    await expect(account).toContainText(OWNER.name);

    await page.goto('/m/my-bookings');
    await expect(page).toHaveURL(/\/m\/my-bookings$/);
    await expect(page.getByRole('link', { name: messages.member.tabs.myBookings })).toBeVisible();

    // ?as= 로 계정을 고르면 주소에서는 떼어 낸다
    await page.goto('/admin?as=staff');
    await expect(page).toHaveURL(/\/admin$/);
    await expect(account).toContainText(COACH.name);

    // 트레이너는 설정을 보기만 한다
    await page.goto('/admin/settings');
    await expect(page.getByText(messages.admin.readOnly)).toBeVisible();
  });

  test('직접 로그인한 세션은 운영처럼 403 을 보고, 버튼으로 계정을 바꾼다', async ({ page }) => {
    await loginAsOwner(page);
    await page.goto('/m/book');
    await expect(page.getByText(messages.forbidden.title)).toBeVisible();

    await page.getByRole('link', { name: messages.dev.login.member }).click();
    await expect(page).toHaveURL(/\/m\/book$/);
    await expect(page.getByRole('link', { name: messages.member.tabs.myBookings })).toBeVisible();
  });
});
