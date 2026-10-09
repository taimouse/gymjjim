import { describe, expect, it } from 'vitest';

import {
  createCenter,
  createMember,
  createPlan,
  createPlatformAdmin,
  createStaff,
  setCenterPlan,
} from './factories';
import { expectDbError, query, queryOne, rpc, rpcError, rpcRows, withUser } from './helpers';

describe('운영자 권한', () => {
  it('운영자가 아니면 운영자 RPC 를 쓸 수 없다', async () => {
    const centerId = await createCenter();
    const owner = await createStaff(centerId, 'owner');
    expect(await rpcError(owner.userId, 'platform_summary')).toBe('FORBIDDEN');
    expect(await rpcError(owner.userId, 'platform_issue_monthly_invoices', { p_month: '2026-10-01' })).toBe(
      'FORBIDDEN',
    );
    expect(
      await rpcError(owner.userId, 'platform_update_center', {
        p_center_id: centerId,
        p_plan_id: null,
        p_status: 'active',
      }),
    ).toBe('FORBIDDEN');
    await expect(rpcRows(owner.userId, 'platform_centers')).rejects.toThrow('FORBIDDEN');
  });

  it('대표는 요금제·운영자 메모를 볼 수 없고 요금제를 만들 수 없다', async () => {
    const centerId = await createCenter();
    const owner = await createStaff(centerId, 'owner');
    const plans = await withUser(owner.userId, (client) => client.query('select id from public.plans'));
    expect(plans.rowCount).toBe(0);
    const notes = await withUser(owner.userId, (client) =>
      client.query('select center_id from public.platform_center_notes'),
    );
    expect(notes.rowCount).toBe(0);
    const error = await expectDbError(
      withUser(owner.userId, (client) =>
        client.query(`insert into public.plans (code, name, monthly_price) values ('hack', '해킹', 0)`),
      ),
    );
    expect(error).toMatch(/row-level security/);
  });

  it('운영자는 요금제를 만들고 바꿀 수 있다', async () => {
    const admin = await createPlatformAdmin();
    const code = `p-${Date.now()}`;
    await withUser(admin, (client) =>
      client.query(
        `insert into public.plans (code, name, monthly_price, max_members) values ($1, '새 요금제', 1000, 10)`,
        [code],
      ),
    );
    await withUser(admin, (client) =>
      client.query(`update public.plans set monthly_price = 2000, is_active = false where code = $1`, [code]),
    );
    const row = await queryOne(`select monthly_price, is_active from public.plans where code = $1`, [code]);
    expect(row).toEqual({ monthly_price: 2000, is_active: false });
  });

  it('운영자 여부가 app_metadata 에 동기화된다', async () => {
    const admin = await createPlatformAdmin();
    const row = await queryOne<{ platform: boolean }>(
      `select (raw_app_meta_data -> 'gymjjim' ->> 'platform')::boolean as platform from auth.users where id = $1`,
      [admin],
    );
    expect(row.platform).toBe(true);
  });
});

describe('센터 등록·변경', () => {
  it('센터와 초대 전 대표를 만들고 목록에 사용량과 함께 보인다', async () => {
    const admin = await createPlatformAdmin();
    const planId = await createPlan({ members: 50, staff: 3 });
    const created = await rpc<{ center_id: string; staff_id: string }>(admin, 'platform_create_center', {
      p_name: '  새 센터  ',
      p_plan_id: planId,
      p_status: 'trial',
      p_owner_name: '박대표',
      p_owner_email: 'NEW.Owner@Example.com',
      p_trial_ends_at: '2026-12-31',
    });
    const staff = await queryOne(`select role, email, user_id from public.staff where id = $1`, [
      created.staff_id,
    ]);
    expect(staff).toEqual({ role: 'owner', email: 'new.owner@example.com', user_id: null });

    await createMember(created.center_id);
    const [row] = await rpcRows(admin, 'platform_centers', { p_center_id: created.center_id });
    expect(row).toMatchObject({
      name: '새 센터',
      status: 'trial',
      trial_ends_at: '2026-12-31',
      max_members: 50,
      member_count: 1,
      staff_count: 1,
      owner_name: '박대표',
      owner_linked: false,
      unpaid_count: 0,
    });
  });

  it('없는 요금제·정지 상태로는 등록할 수 없다', async () => {
    const admin = await createPlatformAdmin();
    const base = { p_name: '센터', p_owner_name: '대표', p_owner_email: 'a@b.c' };
    expect(
      await rpcError(admin, 'platform_create_center', {
        ...base,
        p_plan_id: '00000000-0000-4000-8000-000000000000',
        p_status: 'active',
      }),
    ).toBe('PLAN_NOT_FOUND');
    expect(
      await rpcError(admin, 'platform_create_center', {
        ...base,
        p_plan_id: await createPlan(),
        p_status: 'suspended',
      }),
    ).toBe('INVALID_STATUS');
  });

  it('상태·요금제·메모를 바꾸고 이전 상태를 돌려준다', async () => {
    const admin = await createPlatformAdmin();
    const centerId = await createCenter();
    const planId = await createPlan();
    const result = await rpc(admin, 'platform_update_center', {
      p_center_id: centerId,
      p_plan_id: planId,
      p_status: 'suspended',
      p_trial_ends_at: '2026-12-31',
      p_memo: '미납',
    });
    expect(result).toEqual({ previous_status: 'active', status: 'suspended' });
    const center = await queryOne(
      `select c.plan_id, c.status, c.trial_ends_at, n.memo, c.status_changed_at is not null as changed
       from public.centers c join public.platform_center_notes n on n.center_id = c.id where c.id = $1`,
      [centerId],
    );
    // 체험 종료일은 체험 상태에서만 남긴다
    expect(center).toEqual({
      plan_id: planId,
      status: 'suspended',
      trial_ends_at: null,
      memo: '미납',
      changed: true,
    });
  });
});

describe('청구·입금', () => {
  it('월 일괄 발행은 이용 중인 유료 요금제 센터에만, 한 번씩만 만든다', async () => {
    const admin = await createPlatformAdmin();
    const paid = await createCenter();
    const trial = await createCenter();
    const free = await createCenter();
    await setCenterPlan(paid, { planId: await createPlan({ price: 55000 }) });
    await setCenterPlan(trial, { planId: await createPlan({ price: 55000 }), status: 'trial' });
    await setCenterPlan(free, { planId: await createPlan({ price: 0 }) });

    await rpc(admin, 'platform_issue_monthly_invoices', { p_month: '2030-03-17' });
    await rpc(admin, 'platform_issue_monthly_invoices', { p_month: '2030-03-01' });
    const rows = await query(
      `select center_id, period_start::text, period_end::text, due_date::text, amount, status
       from public.invoices where center_id = any($1::uuid[])`,
      [[paid, trial, free]],
    );
    expect(rows).toEqual([
      {
        center_id: paid,
        period_start: '2030-03-01',
        period_end: '2030-03-31',
        due_date: '2030-03-10',
        amount: 55000,
        status: 'pending',
      },
    ]);
  });

  it('입금 처리 → 되돌리기, 취소 후 같은 달 재발행', async () => {
    const admin = await createPlatformAdmin();
    const centerId = await createCenter();
    const owner = await createStaff(centerId, 'owner');
    const other = await createStaff(await createCenter(), 'owner');
    const args = {
      p_center_id: centerId,
      p_period_start: '2030-04-01',
      p_period_end: '2030-04-30',
      p_amount: 30000,
      p_due_date: '2030-04-10',
    };
    const invoiceId = await rpc<string>(admin, 'platform_create_invoice', args);
    expect(await rpcError(admin, 'platform_create_invoice', args)).toBe('INVOICE_EXISTS');

    expect(
      await rpc(admin, 'platform_set_invoice_status', { p_invoice_id: invoiceId, p_status: 'paid' }),
    ).toMatchObject({ previous_status: 'pending', status: 'paid' });
    const paidAt = () =>
      queryOne(`select status, paid_at is not null as paid from public.invoices where id = $1`, [invoiceId]);
    expect(await paidAt()).toEqual({ status: 'paid', paid: true });

    await rpc(admin, 'platform_set_invoice_status', { p_invoice_id: invoiceId, p_status: 'pending' });
    expect(await paidAt()).toEqual({ status: 'pending', paid: false });

    // 대표는 자기 센터 청구서만 본다
    const mine = await withUser(owner.userId, (client) => client.query('select id from public.invoices'));
    expect(mine.rows).toEqual([{ id: invoiceId }]);
    const others = await withUser(other.userId, (client) => client.query('select id from public.invoices'));
    expect(others.rowCount).toBe(0);

    await rpc(admin, 'platform_set_invoice_status', { p_invoice_id: invoiceId, p_status: 'void' });
    const reissued = await rpc<string>(admin, 'platform_create_invoice', args);
    expect(reissued).not.toBe(invoiceId);
    expect(
      await rpcError(admin, 'platform_set_invoice_status', { p_invoice_id: invoiceId, p_status: 'pending' }),
    ).toBe('INVOICE_EXISTS');
  });

  it('대시보드에 그 달 청구·입금·미납과 센터 상태 수가 나온다', async () => {
    const admin = await createPlatformAdmin();
    const summary = await rpc<{
      month: string;
      centers: Record<string, number>;
      billed: number;
      paid: number;
      unpaid: number;
    }>(admin, 'platform_summary', { p_month: '2030-04-20' });
    expect(summary.month).toBe('2030-04-01');
    expect(summary.billed).toBe(summary.paid + summary.unpaid);
    expect(summary.centers.active).toBeGreaterThan(0);
  });
});
