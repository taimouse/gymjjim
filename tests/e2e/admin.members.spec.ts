import { expect, test } from '@playwright/test';

import { addDaysToKey, formatDateKey } from '@/lib/format';

import { today } from './support/fixtures';
import { fill, messages } from './support/messages';
import { loginAsOwner } from './support/supabase';

const t = messages.members;

test('(4) 회원 등록 → 이용권 부여 → 정지 → 만료일 연장 확인', async ({ page }) => {
  const suffix = String(Date.now()).slice(-8);
  const name = `테스트${suffix.slice(-4)}`;
  const phone = `010${suffix}`;
  await loginAsOwner(page);

  // 회원 등록 (개인정보 동의 필수) → 저장하면 회원 드로어가 열린다
  await page.goto('/admin/members');
  await page.getByRole('button', { name: t.add, exact: true }).click();
  const form = page.getByRole('dialog', { name: t.form.createTitle });
  await form.getByLabel(t.form.name).fill(name);
  await form.getByLabel(t.form.phone).fill(phone);
  await form.getByLabel(t.form.privacy).check();
  await form.getByRole('button', { name: messages.common.save }).click();
  await expect(page.getByText(t.form.created)).toBeVisible();
  const drawer = page.getByRole('dialog', { name: name });

  // 이용권 부여: 1개월 자유이용권(30일) → 만료일 = 오늘 + 29일
  await drawer.getByRole('button', { name: t.drawer.grantPass }).first().click();
  const grant = page.getByRole('dialog', { name: t.grant.title });
  await grant.getByLabel(t.grant.product).click();
  await page.getByRole('option', { name: /1개월 자유이용권/ }).click();
  await grant.getByRole('button', { name: t.grant.submit }).click();
  await expect(page.getByText(t.grant.done)).toBeVisible();
  const endDate = addDaysToKey(today(), 29);
  await expect(drawer.getByText(formatDateKey(endDate, { year: true }))).toBeVisible();

  // 정지 7일 (3일 뒤 ~ 9일 뒤) → 만료일이 7일 늘어난다
  await drawer.getByRole('button', { name: t.drawer.hold, exact: true }).click();
  const hold = page.getByRole('dialog', { name: t.hold.title });
  await hold.getByLabel(t.hold.start).fill(addDaysToKey(today(), 3));
  await hold.getByLabel(t.hold.end).fill(addDaysToKey(today(), 9));
  const extended = addDaysToKey(endDate, 7);
  await expect(hold.getByRole('status')).toHaveText(
    fill(t.hold.preview, {
      from: formatDateKey(endDate, { year: true }),
      to: formatDateKey(extended, { year: true }),
      days: 7,
    }),
  );
  await hold.getByRole('button', { name: t.hold.submit }).click();
  await expect(page.getByText(t.hold.done)).toBeVisible();
  await expect(drawer.getByText(formatDateKey(extended, { year: true }))).toBeVisible();
});

test('(5) 어디서든 Ctrl+K 로 회원을 찾아 드로어를 연다', async ({ page }) => {
  await loginAsOwner(page);
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: messages.admin.command.title });
  await palette.getByPlaceholder(messages.admin.command.placeholder).fill('홍길동');
  await palette.getByRole('option', { name: /홍길동/ }).click();
  await expect(page.getByRole('dialog', { name: '홍길동' })).toBeVisible();
});
