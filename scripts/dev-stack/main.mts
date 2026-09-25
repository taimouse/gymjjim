// 도커 없는 로컬 개발 환경 실행기
//   pnpm dev:local          DB(embedded PostgreSQL) + PostgREST + 인증·Realtime 게이트웨이 + next dev
//   pnpm dev:stack          앱 없이 백엔드만 (다른 터미널에서 pnpm dev · pnpm test:e2e)
//   pnpm dev:local --reset  DB 를 시드부터 다시 만든다
// Ctrl+C 로 한꺼번에 끈다. Supabase 로컬(supabase start)과 같은 주소·키를 쓰므로 앱 코드는 그대로다.
// 앱은 로그인 없이 시드 계정으로 들어간다 (GYMJJIM_DEV_LOGIN=1 → src/lib/auth/dev-login.ts).
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createAuthStore } from './auth-store.mts';
import {
  API_URL,
  appEnv,
  CACHE_DIR,
  DATABASE,
  ENV_FILE,
  MAILBOX_URL,
  PORTS,
  ROOT,
  SITE_URL,
} from './config.mts';
import { startDevDatabase } from './db.mts';
import { startGateway } from './gateway.mts';
import { ensurePostgrest, startPostgrest } from './postgrest.mts';
import { createRealtime } from './realtime.mts';

const args = new Set(process.argv.slice(2));
const withNext = !args.has('--no-next');
const cleanups: (() => Promise<void> | void)[] = [];
let stopping = false;

async function stop(code: number): Promise<never> {
  if (!stopping) {
    stopping = true;
    for (const cleanup of cleanups.reverse()) await Promise.resolve(cleanup()).catch(() => undefined);
    fs.rmSync(ENV_FILE, { force: true });
  }
  process.exit(code);
}

function printSummary(): void {
  console.log(`
  ┌─ 로컬 개발 환경 (도커 없이) ───────────────────────────────
  │ 앱        ${withNext ? SITE_URL : '(pnpm dev 로 따로 실행 · .env.local 에 .cache/dev-stack.env 값)'}
  │ API       ${API_URL}   (Supabase 로컬과 같은 주소·키)
  │ 메일함    ${MAILBOX_URL}   (매직링크·직원 초대 링크)
  │ DB        postgres://postgres:postgres@127.0.0.1:${PORTS.database}/${DATABASE}
  ├─ 로그인 없이 보기: 주소만 열면 시드 계정으로 들어가요
  │ 관리자    ${SITE_URL}/admin     대표 김대표 (트레이너 이코치: /admin?as=staff)
  │ 회원      ${SITE_URL}/m         회원 홍길동
  ├─ 직접 로그인할 때 (비밀번호 모두 gymjjim1234!)
  │ 관리자    owner@gymjjim.test · coach.lee@gymjjim.test   → /admin-login
  │ 회원      member1@gymjjim.test → /login 에서 "이메일로 로그인 링크 받기" 후 메일함
  ├─ 안 되는 것: 카카오 로그인 · 알림 발송(Edge Function)
  └─ 끄기: Ctrl+C   ·   DB 초기화: pnpm dev:local --reset
`);
}

async function main(): Promise<void> {
  console.log('gymjjim 로컬 개발 스택을 켜는 중…');
  const db = await startDevDatabase({ reset: args.has('--reset') });
  cleanups.push(db.stop);
  console.log(
    db.created
      ? '  ✓ DB 새로 만듦 (마이그레이션 + 시드)'
      : `  ✓ DB 재사용${db.applied.length > 0 ? ` · 새 마이그레이션 ${db.applied.length}개 적용` : ''}`,
  );

  const executable = await ensurePostgrest((line) => console.log(`  … ${line}`));
  const postgrest = await startPostgrest(executable, db.postgrestUrl);
  cleanups.push(postgrest.stop);
  console.log('  ✓ PostgREST');

  const realtime = await createRealtime(
    `postgres://postgres:postgres@127.0.0.1:${PORTS.database}/${DATABASE}`,
  );
  cleanups.push(realtime.close);
  const gateway = await startGateway(createAuthStore(db.pool), realtime);
  cleanups.push(() => new Promise<void>((resolve) => gateway.close(() => resolve())));
  console.log(`  ✓ API ${API_URL}`);

  // E2E(Playwright)가 같은 주소·키를 쓰도록 남겨 둔다. 끌 때 지운다
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const env = appEnv();
  fs.writeFileSync(
    ENV_FILE,
    `${Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
  );
  printSummary();

  if (withNext) {
    const next: ChildProcess = spawn(
      process.execPath,
      [path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '--port', String(PORTS.next)],
      { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit' },
    );
    cleanups.push(() => void next.kill());
    next.on('exit', (code) => void stop(code ?? 0));
  }
}

process.on('SIGINT', () => void stop(0));
process.on('SIGTERM', () => void stop(0));

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n로컬 개발 스택을 켜지 못했습니다: ${message}`);
  if (message.includes('EADDRINUSE'))
    console.error('이미 켜져 있는 스택이나 다른 프로그램이 포트를 쓰고 있어요.');
  await stop(1);
});
