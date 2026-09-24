import type { TestProject } from 'vitest/node';

import { createDatabase, startCluster } from '../../scripts/lib/embedded-db.mjs';

const PORT = Number(process.env.GYMJJIM_TEST_DB_PORT ?? 54390);

// embedded PostgreSQL 을 띄우고 shim → 마이그레이션 → 시드를 적용한 테스트 DB 를 만든다.
export default async function setup(project: TestProject) {
  const { conn, stop } = await startCluster({ name: 'test', port: PORT });
  const dbUrl = await createDatabase(conn, 'gymjjim_test', { seed: true });
  project.provide('dbUrl', dbUrl);
  return async () => {
    await stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}
