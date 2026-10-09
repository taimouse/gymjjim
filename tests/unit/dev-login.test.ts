import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { devLoginEnabled, devSignIn, pickDevAccount } from '@/lib/auth/dev-login';

const OWNER = { gymjjim: { staff: [{ center_id: 'c1', role: 'owner' }], member: [] } };
const MEMBER = { gymjjim: { staff: [], member: [{ center_id: 'c1', member_id: 'm1' }] } };
const byDevLogin = [{ method: 'dev', timestamp: 1 }];
const byPassword = [{ method: 'password', timestamp: 1 }];

beforeEach(() => {
  vi.stubEnv('GYMJJIM_DEV_LOGIN', '1');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'anon');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('로그인 없이 보기 (로컬 개발 스택 전용)', () => {
  it('GYMJJIM_DEV_LOGIN=1 일 때만 켜지고, 운영 빌드에서는 켜 두어도 꺼진다', () => {
    expect(devLoginEnabled()).toBe(true);
    vi.stubEnv('NODE_ENV', 'production');
    expect(devLoginEnabled()).toBe(false);
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GYMJJIM_DEV_LOGIN', '');
    expect(devLoginEnabled()).toBe(false);
  });

  it('로그인 전에는 관리자·첫 화면은 대표, 회원 화면은 회원, 운영자 화면은 운영자로 들어간다', () => {
    expect(pickDevAccount('admin', null, null)).toBe('owner');
    expect(pickDevAccount('root', null, null)).toBe('owner');
    expect(pickDevAccount('member', null, null)).toBe('member');
    expect(pickDevAccount('platform', null, null)).toBe('platform');
    expect(pickDevAccount('platform', null, { app_metadata: OWNER, amr: byDevLogin })).toBe('platform');
  });

  it('?as= 로 고른 계정이 우선이고, 모르는 값은 무시한다', () => {
    expect(pickDevAccount('admin', 'staff', { app_metadata: OWNER, amr: byPassword })).toBe('staff');
    expect(pickDevAccount('admin', 'root', null)).toBe('owner');
    expect(pickDevAccount('admin', 'root', { app_metadata: OWNER, amr: byDevLogin })).toBeNull();
  });

  it('로그인 없이 들어온 세션은 권한 없는 화면에 가면 맞는 계정으로 바뀐다', () => {
    expect(pickDevAccount('member', null, { app_metadata: OWNER, amr: byDevLogin })).toBe('member');
    expect(pickDevAccount('admin', null, { app_metadata: MEMBER, amr: byDevLogin })).toBe('owner');
    expect(pickDevAccount('admin', null, { app_metadata: OWNER, amr: byDevLogin })).toBeNull();
  });

  it('직접 로그인한 세션은 바꾸지 않는다 (운영과 같은 403)', () => {
    expect(pickDevAccount('member', null, { app_metadata: OWNER, amr: byPassword })).toBeNull();
    expect(pickDevAccount('admin', null, { app_metadata: MEMBER })).toBeNull();
    // 클레임만으로 판단할 수 없으면(소속 정보 없음) 레이아웃의 DB 확인에 맡긴다
    expect(pickDevAccount('admin', null, { app_metadata: {}, amr: byDevLogin })).toBeNull();
  });
});

describe('devSignIn', () => {
  it('개발 스택에서 받은 세션을 쿠키에 심는다', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: 'access', refresh_token: 'refresh', token_type: 'bearer' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const setSession = vi.fn(async () => ({ error: null }));

    await expect(devSignIn({ auth: { setSession } }, 'staff')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/_dev/session',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ as: 'staff' }) }),
    );
    expect(setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' });
  });

  it('꺼져 있으면 개발 스택을 부르지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(devSignIn({ auth: { setSession: vi.fn() } }, 'owner')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('실제 Supabase(없는 API)·이상한 응답·연결 실패·세션 오류면 false', async () => {
    const setSession = vi.fn(async () => ({ error: null }));
    const cases: (() => Promise<Response>)[] = [
      async () => Response.json({ message: 'no Route matched' }, { status: 404 }),
      async () => Response.json({ access_token: '' }),
      async () => {
        throw new TypeError('fetch failed');
      },
    ];
    for (const respond of cases) {
      vi.stubGlobal('fetch', vi.fn(respond));
      await expect(devSignIn({ auth: { setSession } }, 'owner')).resolves.toBe(false);
    }
    expect(setSession).not.toHaveBeenCalled();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ access_token: 'a', refresh_token: 'r' })),
    );
    const failing = vi.fn(async () => ({ error: new Error('session_not_found') }));
    await expect(devSignIn({ auth: { setSession: failing } }, 'owner')).resolves.toBe(false);
  });
});
