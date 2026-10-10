import { describe, expect, it } from 'vitest';

import { areaOf, canEnter, parseRoleClaims } from '@/lib/auth/roles';
import { safeNext } from '@/lib/safe-redirect';

describe('safeNext (오픈 리다이렉트 방지)', () => {
  it('같은 사이트 상대 경로만 허용한다', () => {
    expect(safeNext('/m/book?date=2026-09-25')).toBe('/m/book?date=2026-09-25');
    expect(safeNext('/auth/accept-invite?token=abc')).toBe('/auth/accept-invite?token=abc');
  });

  it('외부 주소·프로토콜 상대 주소는 기본값으로', () => {
    for (const value of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      'javascript:alert(1)',
      '',
      null,
      42,
    ]) {
      expect(safeNext(value, '/m')).toBe('/m');
    }
  });
});

describe('역할 클레임', () => {
  const staffClaims = { gymjjim: { staff: [{ center_id: 'c1', role: 'owner' }], member: [] } };
  const memberClaims = { gymjjim: { staff: [], member: [{ center_id: 'c1', member_id: 'm1' }] } };

  it('app_metadata.gymjjim 을 읽는다', () => {
    expect(parseRoleClaims(staffClaims)?.staff).toHaveLength(1);
    expect(parseRoleClaims({ provider: 'kakao' })).toBeNull();
    expect(parseRoleClaims(null)).toBeNull();
  });

  it('경로 영역을 구분한다', () => {
    expect(areaOf('/')).toBe('root');
    expect(areaOf('/admin')).toBe('admin');
    expect(areaOf('/admin/calendar')).toBe('admin');
    expect(areaOf('/admin-login')).toBe('public');
    expect(areaOf('/invite/abc')).toBe('public');
    expect(areaOf('/auth/callback')).toBe('public');
    expect(areaOf('/privacy')).toBe('public');
    expect(areaOf('/m/book')).toBe('member');
    expect(areaOf('/welcome')).toBe('member');
  });

  it('직원은 관리자 영역, 회원은 회원 영역만', () => {
    const staff = parseRoleClaims(staffClaims);
    const member = parseRoleClaims(memberClaims);
    expect(canEnter('admin', staff)).toBe(true);
    expect(canEnter('member', staff)).toBe(false);
    expect(canEnter('admin', member)).toBe(false);
    expect(canEnter('member', member)).toBe(true);
  });

  it('클레임이 없으면 판단을 보류한다 (DB 로 확인)', () => {
    expect(canEnter('admin', null)).toBeNull();
  });

  it('운영자 영역은 platform 클레임이 있어야 하고, 예전 클레임은 운영자가 아니다', () => {
    expect(areaOf('/platform')).toBe('platform');
    expect(areaOf('/platform/centers')).toBe('platform');
    expect(areaOf('/platformx')).toBe('member');
    const operator = parseRoleClaims({ gymjjim: { staff: [], member: [], platform: true } });
    expect(canEnter('platform', operator)).toBe(true);
    expect(canEnter('admin', operator)).toBe(false);
    expect(canEnter('platform', parseRoleClaims(staffClaims))).toBe(false);
  });
});
