import { expect, test } from '@playwright/test';

import { fill, messages } from './support/messages';
import { loginAsOwner } from './support/supabase';

// 운영자 시드 계정(admin@gymjjim.test)으로 로그인 없이 들어가는 로컬 스택에서만 돌린다
test.skip(process.env.GYMJJIM_DEV_LOGIN !== '1', '로컬 개발 스택(pnpm dev:local)에서만 확인한다');

const t = messages.platform;

test.describe('(7) 운영자 콘솔', () => {
  test('대시보드 · 센터 목록 · 상세 드로어 · 요금제', async ({ page }) => {
    await page.goto('/platform?as=platform');
    await expect(page).toHaveURL(/\/platform$/);
    await expect(page.getByRole('heading', { name: t.dashboard.title })).toBeVisible();
    await expect(page.getByRole('link', { name: /재키짐 요가 홍대점/ })).toBeVisible();

    await page
      .getByRole('navigation', { name: t.nav.label })
      .getByRole('link', { name: t.nav.centers })
      .click();
    await expect(page.getByRole('heading', { name: t.centers.title })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(4);

    // 정지 필터 → 부산점만, 상세에 운영 메모와 연체 청구서
    await page.getByRole('radio', { name: t.status.suspended }).click();
    await expect(page).toHaveURL(/status=suspended/);
    await expect(page.getByRole('row')).toHaveCount(2);
    await page.getByRole('button', { name: '재키짐 크로스핏 부산점' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: '재키짐 크로스핏 부산점' })).toBeVisible();
    await expect(drawer.getByLabel(t.centers.detail.memo)).toHaveValue(/미납으로 정지/);
    await expect(drawer.getByText(t.invoiceStatus.overdue)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/center=/);

    await page.goto('/platform/plans');
    await expect(page.getByRole('row')).toHaveCount(4);
    await page.getByRole('button', { name: '베이직' }).click();
    await expect(page.getByRole('dialog').getByLabel(t.plans.maxMembers)).toHaveValue('300');
  });

  test('입금 확인은 바로 되고 되돌리기로 미납으로 돌아간다', async ({ page }) => {
    await page.goto('/platform/invoices?as=platform&status=pending');
    const row = page.getByRole('row').filter({ hasText: '재키 피트니스 구미점' });
    await expect(row).toHaveCount(1);

    await row.getByRole('button', { name: t.invoices.markPaid }).click();
    await expect(
      page.getByText(fill(t.invoices.changed.paid, { name: '재키 피트니스 구미점' })),
    ).toBeVisible();
    // 미납 필터라 입금한 줄은 사라진다
    await expect(row).toHaveCount(0);

    await page.getByRole('button', { name: messages.common.undo }).click();
    await expect(row).toHaveCount(1);
  });

  test('대표는 설정에서 요금제 사용량을 보고, 운영자 화면에는 들어갈 수 없다', async ({ page }) => {
    await page.goto('/admin/settings?as=owner');
    await expect(page.getByText(messages.settings.plan.title)).toBeVisible();
    await expect(page.getByRole('meter', { name: messages.settings.plan.members })).toHaveAttribute(
      'aria-valuemax',
      '300',
    );

    // 직접 로그인한 세션은 로그인 없이 보기가 계정을 바꾸지 않으므로 운영과 같은 403
    await loginAsOwner(page);
    await page.goto('/platform');
    await expect(page.getByText(messages.forbidden.platform)).toBeVisible();
  });
});
