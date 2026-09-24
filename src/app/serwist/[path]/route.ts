import { spawnSync } from 'node:child_process';

import { createSerwistRoute } from '@serwist/turbopack';

// 오프라인 안내 페이지는 설치 때 미리 캐시한다. 배포마다 새 리비전
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() ||
  crypto.randomUUID();

/** 서비스 워커(/serwist/sw.js)를 src/app/sw.ts 에서 빌드해 내보낸다 */
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: '/offline', revision }],
  // 미리 받는 것은 CSS 와 오프라인 안내뿐. JS 는 방문한 화면만 런타임 캐시한다
  // (관리자용 캘린더·차트 번들까지 회원 휴대폰에 미리 받지 않도록)
  globPatterns: ['.next/static/**/*.css'],
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
});
