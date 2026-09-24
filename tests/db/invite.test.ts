import { describe, expect, it } from 'vitest';

import { createMember, createUser } from './factories';
import { query, queryOne, rpc, rpcError, rpcRows } from './helpers';
import { setupScenario } from './scenario';

interface InviteResult {
  token: string;
  expires_at: string;
}

async function newInvite() {
  const scenario = await setupScenario();
  const member = await createMember(scenario.centerId, { withUser: false, name: '홍길동' });
  const invite = await rpc<InviteResult>(scenario.staff.userId, 'create_member_invite', {
    p_member_id: member.id,
  });
  return { scenario, member, token: invite.token };
}

describe('회원 초대', () => {
  it('로그인 전에도 초대를 확인할 수 있고, 회원 이름은 가운데를 가린다', async () => {
    const { token } = await newInvite();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const info = await rpc<{ status: string; member_name: string }>(null, 'get_invite', { p_token: token });
    expect(info).toMatchObject({ status: 'valid', member_name: '홍*동' });
    expect(await rpc(null, 'get_invite', { p_token: 'x'.repeat(64) })).toEqual({ status: 'invalid' });
  });

  it('DB 에는 토큰 원문이 아니라 해시만 저장한다', async () => {
    const { member, token } = await newInvite();
    const row = await queryOne<{ token_hash: string }>(
      `select token_hash from public.member_invites where member_id = $1`,
      [member.id],
    );
    expect(row.token_hash).not.toContain(token);
    expect(row.token_hash).toHaveLength(64);
  });

  it('로그인한 사용자가 수락하면 회원과 연결되고 역할 클레임이 갱신된다', async () => {
    const { scenario, member, token } = await newInvite();
    const userId = await createUser();
    const result = await rpc(userId, 'accept_member_invite', { p_token: token });
    expect(result).toEqual({ member_id: member.id, center_id: scenario.centerId, onboarded: false });

    const linked = await queryOne<{ user_id: string }>(`select user_id from public.members where id = $1`, [
      member.id,
    ]);
    expect(linked.user_id).toBe(userId);
    const claims = await queryOne<{ roles: { member: { member_id: string }[] } }>(
      `select raw_app_meta_data -> 'gymjjim' as roles from auth.users where id = $1`,
      [userId],
    );
    expect(claims.roles.member).toEqual([{ center_id: scenario.centerId, member_id: member.id }]);

    // 같은 사람이 다시 열면 성공, 다른 사람은 실패
    expect(await rpc(userId, 'accept_member_invite', { p_token: token })).toMatchObject({
      member_id: member.id,
    });
    expect(await rpcError(await createUser(), 'accept_member_invite', { p_token: token })).toBe(
      'INVITE_USED',
    );
    expect(await rpc(null, 'get_invite', { p_token: token })).toMatchObject({ status: 'used' });
  });

  it('새 초대를 만들면 이전 초대는 무효가 된다', async () => {
    const { scenario, member, token } = await newInvite();
    await rpc(scenario.staff.userId, 'create_member_invite', { p_member_id: member.id });
    expect(await rpcError(await createUser(), 'accept_member_invite', { p_token: token })).toBe(
      'INVITE_INVALID',
    );
  });

  it('만료된 초대는 수락할 수 없다', async () => {
    const { member, token } = await newInvite();
    await query(
      `update public.member_invites set expires_at = now() - interval '1 minute' where member_id = $1`,
      [member.id],
    );
    expect(await rpcError(await createUser(), 'accept_member_invite', { p_token: token })).toBe(
      'INVITE_EXPIRED',
    );
  });

  it('이미 연결된 회원·다른 센터 직원·회원은 초대를 만들 수 없다', async () => {
    const scenario = await setupScenario();
    const other = await setupScenario();
    const linked = await createMember(scenario.centerId);
    const unlinked = await createMember(scenario.centerId, { withUser: false });
    expect(await rpcError(scenario.staff.userId, 'create_member_invite', { p_member_id: linked.id })).toBe(
      'MEMBER_ALREADY_LINKED',
    );
    expect(await rpcError(other.staff.userId, 'create_member_invite', { p_member_id: unlinked.id })).toBe(
      'FORBIDDEN',
    );
    expect(await rpcError(linked.userId, 'create_member_invite', { p_member_id: unlinked.id })).toBe(
      'FORBIDDEN',
    );
  });

  it('링크 주소를 주면 초대 알림톡을 대기열에 넣고, 이상한 주소는 거부한다', async () => {
    const scenario = await setupScenario();
    const member = await createMember(scenario.centerId, { withUser: false });
    await rpc(scenario.staff.userId, 'create_member_invite', {
      p_member_id: member.id,
      p_invite_url_base: 'https://app.gymjjim.test/invite/',
    });
    const [log] = await query<{ type: string; payload: { invite_url: string } }>(
      `select type, payload from public.notification_logs where member_id = $1`,
      [member.id],
    );
    expect(log!.type).toBe('member_invite');
    expect(log!.payload.invite_url).toMatch(/^https:\/\/app\.gymjjim\.test\/invite\/[0-9a-f]{64}$/);
    expect(
      await rpcError(scenario.staff.userId, 'create_member_invite', {
        p_member_id: member.id,
        p_invite_url_base: 'javascript:alert(1)//invite/',
      }),
    ).toBe('VALIDATION');
  });
});

describe('첫 로그인 동의', () => {
  it('동의 일시를 저장하고 내 소속에 반영된다', async () => {
    const scenario = await setupScenario();
    const member = await createMember(scenario.centerId);
    const before = await rpcRows<{ onboarded_at: string | null }>(member.userId, 'my_memberships');
    expect(before).toHaveLength(1);
    expect(before[0]!.onboarded_at).toBeNull();

    expect(await rpc(member.userId, 'complete_onboarding', { p_marketing_agreed: true })).toEqual({
      updated: 1,
    });
    const row = await queryOne<{ onboarded: boolean; marketing: boolean }>(
      `select onboarded_at is not null as onboarded, marketing_agreed_at is not null as marketing
       from public.members where id = $1`,
      [member.id],
    );
    expect(row).toEqual({ onboarded: true, marketing: true });
  });

  it('회원이 아닌 사용자는 동의 처리할 수 없다', async () => {
    expect(await rpcError(await createUser(), 'complete_onboarding', { p_marketing_agreed: false })).toBe(
      'FORBIDDEN',
    );
  });
});
