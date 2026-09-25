// PostgREST(Supabase 의 /rest/v1 을 맡는 서버) 공식 실행 파일을 받아 두고 실행한다.
// https://github.com/PostgREST/postgrest/releases — 버전을 고정하고, 받은 파일은 .cache/bin 에 둔다.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CACHE_DIR, JWT_SECRET, PORTS } from './config.mts';

const VERSION = 'v16.4';

// 운영체제별 릴리스 파일. sha256 이 있으면 압축을 푼 실행 파일을 검증한다 (Windows 는 처음 받을 때 확인한 값)
const ASSETS: Record<string, { file: string; sha256?: string }> = {
  'win32-x64': {
    file: `postgrest-${VERSION}-windows-x86-64.zip`,
    sha256: 'c4155000dfb0befb59215b65d61a621bbaea1515f36a6e758fc504c7ca0dcbee',
  },
  'linux-x64': { file: `postgrest-${VERSION}-linux-static-x86-64.tar.xz` },
  'linux-arm64': { file: `postgrest-${VERSION}-linux-static-aarch64.tar.xz` },
  'darwin-arm64': { file: `postgrest-${VERSION}-macos-aarch64.tar.xz` },
  'darwin-x64': { file: `postgrest-${VERSION}-macos-x86-64.tar.xz` },
};

const BIN_DIR = path.join(CACHE_DIR, 'bin', `postgrest-${VERSION}`);
const EXECUTABLE = path.join(BIN_DIR, process.platform === 'win32' ? 'postgrest.exe' : 'postgrest');

async function download(url: string, target: string): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`PostgREST 다운로드 실패: HTTP ${response.status} ${url}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

/** 없으면 받아서 압축을 푼다. 실행 파일 경로를 돌려준다 */
export async function ensurePostgrest(log: (line: string) => void): Promise<string> {
  if (fs.existsSync(EXECUTABLE)) return EXECUTABLE;
  const asset = ASSETS[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error(`PostgREST 실행 파일이 없는 플랫폼입니다: ${process.platform}-${process.arch}`);

  fs.mkdirSync(BIN_DIR, { recursive: true });
  const archive = path.join(BIN_DIR, asset.file);
  const url = `https://github.com/PostgREST/postgrest/releases/download/${VERSION}/${asset.file}`;
  log(`PostgREST ${VERSION} 받는 중… (${url})`);
  await download(url, archive);

  // Windows 10 이상과 macOS·Linux 에 기본으로 있는 tar 가 zip·tar.xz 를 모두 푼다
  const result = spawnSync('tar', ['-xf', archive, '-C', BIN_DIR], { stdio: 'inherit' });
  fs.rmSync(archive);
  if (result.status !== 0 || !fs.existsSync(EXECUTABLE)) throw new Error('PostgREST 압축을 풀지 못했습니다.');

  const digest = createHash('sha256').update(fs.readFileSync(EXECUTABLE)).digest('hex');
  if (asset.sha256 && digest !== asset.sha256) {
    fs.rmSync(EXECUTABLE);
    throw new Error(`PostgREST 실행 파일 해시가 다릅니다: ${digest}`);
  }
  log(`PostgREST 준비 완료 (sha256 ${digest.slice(0, 12)}…)`);
  return EXECUTABLE;
}

async function waitUntilReady(timeoutMs: number, exited: () => Error | null): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const error = exited();
    if (error) throw error;
    try {
      const response = await fetch(`http://127.0.0.1:${PORTS.postgrestAdmin}/ready`);
      if (response.ok) return;
    } catch {
      // 아직 뜨는 중
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('PostgREST 가 제시간에 뜨지 않았습니다.');
}

/**
 * Windows 용 PostgREST 는 PostgreSQL 클라이언트 라이브러리(libpq.dll 과 그 의존 DLL)가 PATH 에 있어야 뜬다.
 * 이미 쓰고 있는 embedded-postgres 의 PostgreSQL bin 폴더를 앞에 붙인다.
 */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (process.platform !== 'win32') return env;
  const entry = fileURLToPath(import.meta.resolve('embedded-postgres'));
  const marker = `${path.sep}node_modules${path.sep}embedded-postgres${path.sep}`;
  const modules = entry.slice(0, entry.lastIndexOf(marker) + `${path.sep}node_modules`.length);
  const binDir = path.join(modules, '@embedded-postgres', 'windows-x64', 'native', 'bin');
  if (!fs.existsSync(path.join(binDir, 'libpq.dll'))) return env;
  // Windows 환경 변수 이름은 대소문자를 가리지 않는다 (보통 Path)
  const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';
  env[key] = `${binDir}${path.delimiter}${env[key] ?? ''}`;
  return env;
}

export interface PostgrestProcess {
  stop: () => void;
}

export async function startPostgrest(executable: string, dbUrl: string): Promise<PostgrestProcess> {
  const child: ChildProcess = spawn(executable, [], {
    env: {
      ...childEnv(),
      PGRST_DB_URI: dbUrl,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions',
      PGRST_DB_MAX_ROWS: '1000',
      PGRST_DB_POOL: '10',
      PGRST_JWT_SECRET: JWT_SECRET,
      PGRST_SERVER_HOST: '127.0.0.1',
      PGRST_SERVER_PORT: String(PORTS.postgrest),
      PGRST_ADMIN_SERVER_PORT: String(PORTS.postgrestAdmin),
      PGRST_LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  let exitError: Error | null = null;
  child.once('exit', (code) => {
    exitError = new Error(`PostgREST 가 종료되었습니다 (code ${code})`);
  });
  await waitUntilReady(20_000, () => exitError);
  return { stop: () => void child.kill() };
}
