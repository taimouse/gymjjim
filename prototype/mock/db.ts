/**
 * 프로토타입용 브라우저 DB.
 * 실제 Supabase(Postgres) 테이블과 같은 이름·컬럼의 행을 메모리에 두고 localStorage 에 저장한다.
 * 실제 앱의 조회·서버 액션 코드는 그대로 두고, DB 클라이언트(@/lib/supabase/*)만 이 DB 를 쓰는 가짜로 바뀐다.
 */
import { createSeed } from './seed';

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

/** 저장 모양이 바뀌면 올린다 (예전 데이터는 버리고 시드로 다시 시작) */
const STORAGE_KEY = 'jackygym-prototype-db-v3';

export const CENTER_ID = 'c0000000-0000-4000-8000-000000000001';
export const OWNER_STAFF_ID = 'b0000000-0000-4000-8000-000000000001';
/** 회원 화면에서 로그인한 것으로 보는 회원 (홍길동) */
export const ME_MEMBER_ID = 'd0000000-0000-4000-8000-000000000001';
export const TIME_ZONE = 'Asia/Seoul';

let tables: Tables | null = null;
const listeners = new Set<(changed: ReadonlySet<string>) => void>();

function load(): Tables {
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Tables;
  } catch {
    // 저장소를 못 쓰면(사생활 보호 모드 등) 매번 시드로 시작한다
  }
  return createSeed();
}

export function getTables(): Tables {
  tables ??= load();
  return tables;
}

export function table(name: string): Row[] {
  const all = getTables();
  all[name] ??= [];
  return all[name];
}

/** 변경을 저장하고 구독자(가짜 Realtime)에게 알린다 */
export function commit(changed: Iterable<string>) {
  const set = new Set(changed);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(getTables()));
  } catch {
    // 저장 실패는 무시 (이번 방문 동안은 메모리에 남는다)
  }
  for (const listener of listeners) listener(set);
}

export function onChange(listener: (changed: ReadonlySet<string>) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** RPC 가 중간에 실패하면 트랜잭션처럼 되돌린다 */
export function snapshot(): string {
  return JSON.stringify(getTables());
}
export function restore(saved: string) {
  tables = JSON.parse(saved) as Tables;
}

/** 처음 상태로 */
export function resetDb() {
  tables = createSeed();
  commit(Object.keys(tables));
}

// 다른 탭(회원 앱 ↔ 관리자)에서 바꾸면 이 탭도 다시 읽는다
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    tables = JSON.parse(event.newValue) as Tables;
    for (const listener of listeners) listener(new Set(Object.keys(tables)));
  });
}

export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

/** 앱 에러 코드로 실패 (실제 RPC 의 raise_app_error 와 같은 모양) */
export class AppError extends Error {}
export function raise(code: string): never {
  throw new AppError(code);
}

export function byId(name: string, id: unknown): Row | undefined {
  return table(name).find((row) => row.id === id);
}
