import { describe, expect, it } from 'vitest';

import messages from '@/i18n/messages/ko.json';
import { APP_ERROR_CODES, errorMessageKey, isAppErrorCode, toAppErrorCode } from '@/lib/errors';

describe('앱 에러 코드', () => {
  it('RPC 가 던진 코드(message)를 그대로 쓴다', () => {
    expect(toAppErrorCode({ message: 'SESSION_FULL', code: 'P0001' })).toBe('SESSION_FULL');
    expect(toAppErrorCode({ message: 'PERIOD_LIMIT_REACHED' })).toBe('PERIOD_LIMIT_REACHED');
  });

  it('권한·인증·네트워크 에러를 분류한다', () => {
    expect(toAppErrorCode({ message: 'permission denied for table members', code: '42501' })).toBe(
      'FORBIDDEN',
    );
    expect(toAppErrorCode({ message: 'JWT expired', code: 'PGRST301' })).toBe('NOT_AUTHENTICATED');
    expect(toAppErrorCode({ message: 'TypeError: fetch failed' })).toBe('NETWORK');
  });

  it('모르는 에러는 UNKNOWN', () => {
    expect(toAppErrorCode(null)).toBe('UNKNOWN');
    expect(toAppErrorCode('boom')).toBe('UNKNOWN');
    expect(toAppErrorCode({ message: 'duplicate key value violates unique constraint' })).toBe('UNKNOWN');
  });

  it('모든 코드에 한국어 메시지가 있다 (메시지 키: errors.<CODE>)', () => {
    const errors: Record<string, string> = messages.errors;
    for (const code of APP_ERROR_CODES) {
      expect(errorMessageKey(code)).toBe(`errors.${code}`);
      expect(errors[code], code).toBeTruthy();
    }
    expect(Object.keys(errors).filter((key) => !isAppErrorCode(key))).toEqual([]);
  });
});
