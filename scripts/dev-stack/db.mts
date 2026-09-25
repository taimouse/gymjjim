// 개발용 PostgreSQL: embedded-postgres 클러스터(.cache/pg-dev)에 shim → 마이그레이션 → 시드를 적용한다.
// 한 번 만든 DB 는 유지하고, 새 마이그레이션 파일만 이어서 적용한다. --reset 이면 처음부터 다시 만든다.
import fs from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import { createDatabase, migrationFiles, startCluster } from '../lib/embedded-db.mjs';
import { DATABASE, PORTS } from './config.mts';

export interface DevDatabase {
  pool: pg.Pool;
  /** PostgREST 가 접속할 주소 (authenticator 역할) */
  postgrestUrl: string;
  created: boolean;
  applied: string[];
  stop: () => Promise<void>;
}

// 인증 서버의 세션·일회용 토큰·메일함, 적용한 마이그레이션 기록 (PostgREST 에는 노출되지 않는 스키마)
const DEV_SCHEMA = `
create schema if not exists dev_stack;
create table if not exists dev_stack.migrations (name text primary key, applied_at timestamptz not null default now());
create table if not exists dev_stack.refresh_tokens (
  token text primary key, user_id uuid not null, session_id uuid not null,
  revoked boolean not null default false, created_at timestamptz not null default now());
-- 세션을 처음 만든 방식(JWT amr). 토큰을 갱신해도 유지한다 (GoTrue 와 같다)
alter table dev_stack.refresh_tokens add column if not exists method text not null default 'password';
create table if not exists dev_stack.one_time_tokens (
  token_hash text primary key, user_id uuid not null, type text not null,
  used_at timestamptz, created_at timestamptz not null default now());
create table if not exists dev_stack.mails (
  id bigserial primary key, recipient text not null, subject text not null, link text not null,
  created_at timestamptz not null default now());
`;

// Realtime 흉내: supabase_realtime publication 에 들어 있는 테이블의 변경을 NOTIFY 로 알린다
const REALTIME_TRIGGERS = `
create or replace function dev_stack.notify_change() returns trigger language plpgsql as $$
begin
  perform pg_notify('dev_stack_changes', json_build_object(
    'schema', tg_table_schema, 'table', tg_table_name, 'type', tg_op,
    'record', case when tg_op = 'DELETE' then null else row_to_json(new) end,
    'old_record', case when tg_op = 'INSERT' then null else row_to_json(old) end,
    'commit_timestamp', now())::text);
  return null;
end $$;
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' loop
    execute format('drop trigger if exists dev_stack_realtime on %I.%I', t.schemaname, t.tablename);
    execute format('create trigger dev_stack_realtime after insert or update or delete on %I.%I
      for each row execute function dev_stack.notify_change()', t.schemaname, t.tablename);
  end loop;
end $$;
`;

async function databaseExists(admin: pg.Client): Promise<boolean> {
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [DATABASE]);
  return (rowCount ?? 0) > 0;
}

/** PostgREST 접속 역할 (Supabase 와 같은 이름). anon·authenticated·service_role 로 전환할 수 있다 */
async function ensureAuthenticator(pool: pg.Pool): Promise<void> {
  await pool.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticator') then
        create role authenticator noinherit login password 'postgres';
      end if;
    end $$;
    grant anon, authenticated, service_role to authenticator;
  `);
}

async function applyPendingMigrations(pool: pg.Pool, created: boolean): Promise<string[]> {
  const files = migrationFiles();
  if (created) {
    // 새로 만든 DB 는 createDatabase 가 전부 적용했다
    for (const file of files)
      await pool.query('insert into dev_stack.migrations (name) values ($1) on conflict do nothing', [
        path.basename(file),
      ]);
    return [];
  }
  const { rows } = await pool.query<{ name: string }>('select name from dev_stack.migrations');
  const done = new Set(rows.map((row) => row.name));
  const applied: string[] = [];
  for (const file of files) {
    const name = path.basename(file);
    if (done.has(name)) continue;
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(fs.readFileSync(file, 'utf8'));
      await client.query('insert into dev_stack.migrations (name) values ($1)', [name]);
      await client.query('commit');
      applied.push(name);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw new Error(`${name} 적용 실패: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    } finally {
      client.release();
    }
  }
  return applied;
}

export async function startDevDatabase({ reset }: { reset: boolean }): Promise<DevDatabase> {
  const { conn, stop } = await startCluster({ name: 'dev', port: PORTS.database });
  const admin = new pg.Client({ ...conn, database: 'postgres' });
  await admin.connect();
  const exists = await databaseExists(admin).finally(() => admin.end());

  const created = reset || !exists;
  if (created) await createDatabase(conn, DATABASE, { seed: true });

  const pool = new pg.Pool({ ...conn, database: DATABASE, max: 8 });
  await pool.query(DEV_SCHEMA);
  await ensureAuthenticator(pool);
  const applied = await applyPendingMigrations(pool, created);
  await pool.query(REALTIME_TRIGGERS);

  return {
    pool,
    postgrestUrl: `postgres://authenticator:postgres@${conn.host}:${conn.port}/${DATABASE}`,
    created,
    applied,
    stop: async () => {
      await pool.end().catch(() => undefined);
      await stop();
    },
  };
}
