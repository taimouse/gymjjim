import pg from 'pg';
import { inject } from 'vitest';

// 테스트 DB 연결 (superuser). 사용자 권한이 필요하면 withUser / rpc 를 쓴다.
export const db = new pg.Pool({ connectionString: inject('dbUrl'), max: 40 });

export type Row = Record<string, unknown>;

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await db.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T> {
  const rows = await query<T>(text, params);
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}: ${text}`);
  return rows[0] as T;
}

/**
 * PostgREST 와 같은 방식으로 한 트랜잭션 안에서 역할과 JWT 클레임을 설정하고 실행한다.
 * userId 가 null 이면 anon.
 */
export async function withUser<T>(
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    const role = userId ? 'authenticated' : 'anon';
    await client.query(`set local role ${role}`);
    const claims = userId ? { sub: userId, role } : { role };
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** 사용자 권한으로 public 스키마의 RPC 를 호출하고 결과(jsonb 등)를 돌려준다. */
export async function rpc<T = unknown>(
  userId: string | null,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!IDENTIFIER.test(fn)) throw new Error(`invalid function name: ${fn}`);
  const names = Object.keys(args);
  for (const name of names) if (!IDENTIFIER.test(name)) throw new Error(`invalid arg name: ${name}`);
  const params = names.map((name, index) => `${name} => $${index + 1}`).join(', ');
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ result: T }>(
      `select public.${fn}(${params}) as result`,
      names.map((name) => args[name]),
    );
    return rows[0]!.result;
  });
}

/** RPC 가 앱 에러 코드(예: SESSION_FULL)로 실패해야 할 때 그 코드를 돌려준다. */
export async function rpcError(
  userId: string | null,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  try {
    await rpc(userId, fn, args);
  } catch (error) {
    return (error as pg.DatabaseError).message;
  }
  throw new Error(`expected ${fn} to fail`);
}

/** 쿼리가 실패해야 할 때 에러 메시지를 돌려준다. */
export async function expectDbError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected query to fail');
}
