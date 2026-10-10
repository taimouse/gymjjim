import path from 'node:path';

import type { NextConfig } from 'next';

/**
 * GitHub Pages 용 정적 프로토타입 (DB 없이 브라우저 저장소로 동작)
 * - `pnpm proto:build` → prototype/out 에 정적 파일
 * - Pages 는 https://<owner>.github.io/<repo>/ 아래에 올라가므로 basePath 를 PAGES_BASE_PATH 로 받는다
 * - 실제 앱(src/)의 화면 컴포넌트·디자인 토큰·문구를 그대로 가져다 쓴다
 */
const basePath = process.env.PAGES_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // 저장소 루트까지 열어 두어야 ../src 를 가져올 수 있다
  turbopack: { root: path.resolve(import.meta.dirname, '..') },
};

export default nextConfig;
