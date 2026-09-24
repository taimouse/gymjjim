import type { AppErrorCode } from './errors';

/** 서버 액션·RPC 래퍼의 공통 반환 형태. 에러는 코드로만 전달하고 화면에서 i18n 메시지로 바꾼다. */
export type Result<T> = { ok: true; data: T } | { ok: false; code: AppErrorCode };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function fail(code: AppErrorCode): { ok: false; code: AppErrorCode } {
  return { ok: false, code };
}
