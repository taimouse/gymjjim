import { describe, expect, it } from 'vitest';

import { createProduct } from './factories';
import { query, rpc, rpcError } from './helpers';
import { setupScenario } from './scenario';

function programArgs(centerId: string, productIds: string[], extra: Record<string, unknown> = {}) {
  return {
    p_center_id: centerId,
    p_name: '저녁 요가',
    p_type: 'group',
    p_default_capacity: 12,
    p_duration_min: 60,
    p_color: '#A7F3D0',
    p_allowed_product_ids: productIds,
    ...extra,
  };
}

describe('save_program', () => {
  it('대표는 프로그램과 사용 가능한 이용권을 한 번에 저장한다', async () => {
    const scenario = await setupScenario();
    const second = await createProduct(scenario.centerId, { type: 'period' });
    const id = await rpc<string>(
      scenario.owner.userId,
      'save_program',
      programArgs(scenario.centerId, [scenario.productId, second]),
    );
    const allowed = await query<{ product_id: string }>(
      `select product_id from public.program_allowed_products where program_id = $1 order by product_id`,
      [id],
    );
    expect(allowed.map((row) => row.product_id).sort()).toEqual([scenario.productId, second].sort());

    // 수정하면서 이용권 하나를 뺀다
    await rpc(scenario.owner.userId, 'save_program', {
      ...programArgs(scenario.centerId, [second]),
      p_id: id,
      p_name: '저녁 요가 (중급)',
    });
    const after = await query<{ name: string; products: string[] }>(
      `select p.name, array(select product_id::text from public.program_allowed_products where program_id = p.id) as products
       from public.programs p where p.id = $1`,
      [id],
    );
    expect(after[0]).toEqual({ name: '저녁 요가 (중급)', products: [second] });
  });

  it('트레이너는 프로그램을 만들 수 없다 (RLS)', async () => {
    const scenario = await setupScenario();
    const error = await rpcError(scenario.staff.userId, 'save_program', programArgs(scenario.centerId, []));
    expect(error).toMatch(/row-level security/);
  });

  it('다른 센터 프로그램은 수정할 수 없다', async () => {
    const scenario = await setupScenario();
    const other = await setupScenario();
    const error = await rpcError(other.owner.userId, 'save_program', {
      ...programArgs(other.centerId, []),
      p_id: scenario.programId,
    });
    expect(error).toBe('FORBIDDEN');
  });
});
