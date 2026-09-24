import { expect, test } from '@playwright/test';

import {
  cleanupProgram,
  createProgram,
  createSession,
  prepareMember,
  quietTime,
  tomorrow,
} from './support/fixtures';
import { fill, messages } from './support/messages';
import { memberClient, MEMBERS, signInBrowser } from './support/supabase';

const m = messages.member;

test.describe('회원 모바일', () => {
  const programs: string[] = [];
  test.afterAll(async () => {
    for (const id of programs) await cleanupProgram(id);
  });

  test('(1) 회원 로그인 → 예약 → 취소', async ({ page, context, baseURL }) => {
    const program = await createProgram('예약');
    programs.push(program.id);
    const date = tomorrow();
    await createSession(program.id, { date, time: quietTime(), capacity: 5 });
    await prepareMember(MEMBERS.hong);
    await signInBrowser(context, baseURL!, MEMBERS.hong);

    // 예약 탭 → 수업 카드 → 바텀시트 [예약하기]
    await page.goto(`/m/book?date=${date}`);
    await page.getByRole('button', { name: new RegExp(program.name) }).click();
    const sheet = page.getByRole('dialog', { name: program.name });
    await expect(sheet.getByText(m.sheet.passToUse)).toBeVisible();
    await sheet.getByRole('button', { name: m.sheet.book, exact: true }).click();
    await expect(page.getByText(m.sheet.booked)).toBeVisible();

    // 내 예약 → 취소 (복구/차감 안내를 먼저 보여준다)
    await page.getByRole('link', { name: m.tabs.myBookings }).click();
    const card = page.getByRole('article').filter({ hasText: program.name });
    await expect(card.getByText(m.book.myBooked)).toBeVisible();
    await card.getByRole('button', { name: m.myBookings.cancel, exact: true }).click();
    const confirm = page.getByRole('dialog', { name: m.cancel.title });
    await expect(confirm.getByRole('status')).toHaveText(m.cancel.period); // 기간권: 기록에 남지 않음
    await confirm.getByRole('button', { name: m.cancel.confirm }).click();
    await expect(page.getByText(m.cancel.done)).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test('(2) 정원 마감 → 대기 신청 → 취소 발생 → 자동 승격', async ({ page, context, baseURL }) => {
    const program = await createProgram('대기');
    programs.push(program.id);
    const date = tomorrow();
    const sessionId = await createSession(program.id, { date, time: quietTime(), capacity: 1 });
    await prepareMember(MEMBERS.hong);
    await prepareMember(MEMBERS.kim);

    // 다른 회원(홍길동)이 마지막 자리를 예약해 정원이 찬다
    const other = await memberClient(MEMBERS.hong);
    const { data: booking, error } = await other.rpc('book_session', { p_session_id: sessionId });
    expect(error).toBeNull();

    // 김민지: 마감된 수업에 대기 신청
    await signInBrowser(context, baseURL!, MEMBERS.kim);
    await page.goto(`/m/book?date=${date}`);
    const card = page.getByRole('button', { name: new RegExp(program.name) });
    await expect(card.getByText(m.book.full)).toBeVisible();
    await card.click();
    const sheet = page.getByRole('dialog', { name: program.name });
    await sheet.getByRole('button', { name: m.sheet.joinWaitlist }).click();
    await expect(page.getByText(fill(m.sheet.waitlisted, { position: 1 }))).toBeVisible();

    // 홍길동이 취소하면 대기 1순위가 자동으로 예약된다
    const bookingId = (booking as { booking_id: string }).booking_id;
    const cancel = await other.rpc('cancel_booking', { p_booking_id: bookingId });
    expect(cancel.error).toBeNull();

    await page.goto('/m/my-bookings');
    const item = page.getByRole('article').filter({ hasText: program.name });
    await expect(item.getByText(m.book.myBooked)).toBeVisible();
  });
});
