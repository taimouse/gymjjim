import { expect, test } from '@playwright/test';

import { cleanupProgram, createProgram, prepareMember, sessionIdsOf, tomorrow } from './support/fixtures';
import { fill, messages } from './support/messages';
import { loginAsOwner, MEMBERS } from './support/supabase';

const t = messages.calendar;

test.describe('관리자 수업 운영', () => {
  let programId: string | null = null;
  test.afterAll(async () => {
    if (programId) await cleanupProgram(programId);
  });

  test('(3) 수업 생성 → 대리 예약 → 출석 체크 → 되돌리기', async ({ page }) => {
    const program = await createProgram('수업');
    programId = program.id;
    await prepareMember(MEMBERS.hong);
    await loginAsOwner(page);

    // 캘린더에서 수업 만들기
    await page.goto('/admin/calendar');
    await page.getByRole('button', { name: t.newSession }).click();
    const create = page.getByRole('dialog', { name: t.create.title });
    await create.getByLabel(t.create.program).click();
    await page.getByRole('option', { name: program.name }).click();
    await create.getByLabel(t.create.date, { exact: true }).fill(tomorrow());
    await create.getByLabel(t.create.startTime).fill('05:30');
    await create.getByRole('button', { name: t.create.submit, exact: true }).click();
    await expect(page.getByText(fill(t.create.done, { count: 1 }))).toBeVisible();

    // 만든 수업의 드로어 (캘린더에서 누르는 것과 같은 ?session= 주소)
    const [sessionId] = await sessionIdsOf(program.id);
    expect(sessionId).toBeTruthy();
    await page.goto(`/admin/calendar?session=${sessionId}`);
    const drawer = page.getByRole('dialog', { name: program.name });

    // 회원 대리 예약
    await drawer.getByRole('button', { name: t.drawer.addMember }).click();
    const book = page.getByRole('dialog', { name: t.staffBook.title });
    await book.getByPlaceholder(t.staffBook.placeholder).fill(MEMBERS.hong.name);
    await book.getByRole('option', { name: new RegExp(MEMBERS.hong.name) }).click();
    await expect(page.getByText(fill(t.staffBook.done, { name: MEMBERS.hong.name }))).toBeVisible();

    // 출석 체크 → 토스트의 [되돌리기]
    const attended = drawer.getByRole('button', { name: t.drawer.attended, exact: true });
    await attended.click();
    await expect(page.getByText(fill(t.drawer.markedAttended, { name: MEMBERS.hong.name }))).toBeVisible();
    await expect(attended).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: messages.common.undo }).click();
    await expect(page.getByText(fill(t.drawer.markedBooked, { name: MEMBERS.hong.name }))).toBeVisible();
    await expect(attended).toHaveAttribute('aria-pressed', 'false');
  });
});
