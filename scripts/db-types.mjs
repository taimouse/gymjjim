// `pnpm db:types` — 마이그레이션 기준으로 Supabase 타입을 생성한다 (Docker 불필요).
// Supabase CLI(`supabase gen types typescript --local`)가 Docker 안에서 실행하는 것과 같은 생성기
// (@supabase/postgres-meta)를 embedded PostgreSQL 에 붙여 실행하므로 결과 형식이 같다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createDatabase, ROOT, startCluster } from './lib/embedded-db.mjs';

const OUTPUT = path.join(ROOT, 'src', 'lib', 'supabase', 'database.types.ts');
const PORT = Number(process.env.GYMJJIM_TEST_DB_PORT ?? 54390);

const require = createRequire(import.meta.url);
const serverScript = path.join(
  path.dirname(require.resolve('@supabase/postgres-meta/package.json')),
  'dist',
  'server',
  'server.js',
);

function generate(dbUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverScript], {
      cwd: ROOT,
      env: {
        ...process.env,
        // supabase CLI 가 로컬 타입 생성 때 넘기는 값과 같게 맞춘다
        PG_META_DB_URL: dbUrl,
        PG_CONN_TIMEOUT_SECS: '30',
        PG_QUERY_TIMEOUT_SECS: '30',
        PG_META_GENERATE_TYPES: 'typescript',
        PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS: 'public',
        PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && stdout.includes('export type Database')) resolve(stdout);
      else reject(new Error(`postgres-meta exited with ${code}\n${stderr || stdout}`));
    });
  });
}

const { conn, stop } = await startCluster({ name: 'test', port: PORT });
try {
  const dbUrl = await createDatabase(conn, 'gymjjim_types');
  const types = await generate(dbUrl);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, types.replace(/\r\n/g, '\n'));
  console.log(`✓ ${path.relative(ROOT, OUTPUT)} 생성 완료`);
} finally {
  await stop();
}
