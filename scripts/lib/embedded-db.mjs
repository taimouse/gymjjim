// Docker 없이 실제 PostgreSQL 17 을 띄워 Supabase 마이그레이션을 적용하는 도구.
// - Vitest DB 테스트(tests/db/global-setup.ts)와 타입 생성(scripts/db-types.mjs)이 함께 쓴다.
// - 클러스터 데이터는 .cache/pg-<name> 에 유지해서 두 번째 실행부터는 몇 초 안에 뜬다.
import fs from 'node:fs';
import path from 'node:path';

import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
export const SEED_FILE = path.join(ROOT, 'supabase', 'seed.sql');
export const SEED_DIR = path.join(ROOT, 'supabase', 'seed');
export const SHIM_FILE = path.join(ROOT, 'tests', 'db', 'supabase-shim.sql');

const USER = 'postgres';
const PASSWORD = 'postgres';

/** @param {{ host: string, port: number, user: string, password: string, database?: string }} conn */
async function canConnect(conn) {
  const client = new pg.Client({ ...conn, database: 'postgres', connectionTimeoutMillis: 1500 });
  try {
    await client.connect();
    await client.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * 클러스터를 띄운다. 이미 같은 포트에 떠 있으면 재사용하고, 그 경우 stop()은 아무것도 하지 않는다.
 * @param {{ name: string, port: number }} options
 */
export async function startCluster({ name, port }) {
  const conn = { host: '127.0.0.1', port, user: USER, password: PASSWORD };
  if (await canConnect(conn)) return { conn, stop: async () => {} };

  const databaseDir = path.join(ROOT, '.cache', `pg-${name}`);
  const cluster = new EmbeddedPostgres({
    databaseDir,
    port,
    user: USER,
    password: PASSWORD,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });

  if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    fs.mkdirSync(path.dirname(databaseDir), { recursive: true });
    await cluster.initialise();
  }

  try {
    await cluster.start();
  } catch (error) {
    // 비정상 종료로 남은 postmaster.pid 때문에 못 뜨는 경우 한 번만 정리하고 재시도
    const pidFile = path.join(databaseDir, 'postmaster.pid');
    if (!fs.existsSync(pidFile)) throw error;
    fs.rmSync(pidFile);
    await cluster.start();
  }
  return { conn, stop: () => cluster.stop() };
}

function sqlFilesIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => path.join(dir, file));
}

/** config.toml [db.seed] sql_paths 와 같은 순서: seed.sql → seed/*.sql */
export function seedFiles() {
  return [SEED_FILE, ...sqlFilesIn(SEED_DIR)];
}

export function migrationFiles() {
  return sqlFilesIn(MIGRATIONS_DIR);
}

/** SQL 파일 실행. 실패하면 파일명과 줄 번호를 붙여서 다시 던진다. */
async function runFile(client, file) {
  const text = fs.readFileSync(file, 'utf8');
  try {
    await client.query(text);
  } catch (error) {
    const position = Number(error.position ?? 0);
    const line = position ? text.slice(0, position).split('\n').length : '?';
    const where = `${path.relative(ROOT, file)}:${line}`;
    throw new Error(`${where} → ${error.message}${error.detail ? ` (${error.detail})` : ''}`, {
      cause: error,
    });
  }
}

/**
 * 데이터베이스를 새로 만들고 shim → 마이그레이션 → (선택) 시드를 적용한다.
 * @param {{ host: string, port: number, user: string, password: string }} conn
 * @param {string} database
 * @param {{ seed?: boolean }} [options]
 */
export async function createDatabase(conn, database, { seed = false } = {}) {
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) throw new Error(`invalid database name: ${database}`);
  const admin = new pg.Client({ ...conn, database: 'postgres' });
  await admin.connect();
  try {
    await admin.query(`drop database if exists ${database} with (force)`);
    await admin.query(`create database ${database}`);
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ ...conn, database });
  await client.connect();
  try {
    await runFile(client, SHIM_FILE);
    for (const file of migrationFiles()) await runFile(client, file);
    if (seed) for (const file of seedFiles()) await runFile(client, file);
  } finally {
    await client.end();
  }
  return `postgres://${conn.user}:${conn.password}@${conn.host}:${conn.port}/${database}`;
}
