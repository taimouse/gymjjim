# gymjjim

헬스장·PT샵·그룹운동 센터를 위한 **예약 중심** 회원관리 웹앱입니다.

- 회원: 스마트폰에서 3탭 안에 수업 예약·취소, 내 이용권 확인 (`/m`)
- 관리자: 캘린더, 예약자·출석, 프로그램·이용권·회원 관리 (`/admin`)

프로젝트 규칙은 [CLAUDE.md](CLAUDE.md), 단계별 작업 목록은 [PROMPTS.md](PROMPTS.md)에 있습니다.

## 기술 스택

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind CSS v4 · shadcn/ui · Supabase (Postgres, Auth, RLS, Realtime, Edge Functions, Cron) · next-intl (한국어) · TanStack Query · React Hook Form + Zod · date-fns v4 · FullCalendar (MIT 플러그인만) · Vitest · Playwright

## 요구 사항

| 도구           | 버전              | 비고                                                                                  |
| -------------- | ----------------- | ------------------------------------------------------------------------------------- |
| Node.js        | 22 이상 (24 권장) |                                                                                       |
| pnpm           | 11                | `corepack enable` 후 자동 사용                                                        |
| Docker Desktop | 최신              | 로컬 Supabase(`supabase start`)와 E2E 테스트에 필요. **DB 단위 테스트에는 필요 없음** |

## 처음 실행하기

```bash
pnpm install
cp .env.example .env.local
```

### 1) 로컬 Supabase 띄우기 (Docker 필요)

```bash
pnpm supabase start          # 처음엔 이미지 다운로드로 몇 분 걸립니다
pnpm supabase status         # API URL, Publishable key, Secret key 확인
```

`pnpm supabase status`에 나온 값을 `.env.local`에 넣습니다.

- `NEXT_PUBLIC_SUPABASE_URL` ← API URL (기본 `http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ← Publishable key
- `SUPABASE_SECRET_KEY` ← Secret key

마이그레이션과 시드 데이터를 적용합니다.

```bash
pnpm supabase db reset
```

로컬 서비스 주소:

| 서비스                                 | 주소                   |
| -------------------------------------- | ---------------------- |
| Supabase Studio                        | http://127.0.0.1:54323 |
| 메일 확인(Mailpit, 매직링크·초대 메일) | http://127.0.0.1:54324 |

### 2) 개발 서버

```bash
pnpm dev
```

http://localhost:3000 에서 확인합니다.

## 스크립트

| 명령                        | 설명                                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| `pnpm dev`                  | 개발 서버                                                                         |
| `pnpm build` / `pnpm start` | 프로덕션 빌드 / 실행                                                              |
| `pnpm typecheck`            | 라우트 타입 생성(`next typegen`) 후 `tsc --noEmit`                                |
| `pnpm lint`                 | ESLint (any 금지, 300줄 제한, JSX 문자열 하드코딩 금지 포함)                      |
| `pnpm format`               | Prettier                                                                          |
| `pnpm test`                 | Vitest 전체 (unit + db)                                                           |
| `pnpm test:unit`            | 순수 로직 테스트                                                                  |
| `pnpm test:db`              | 마이그레이션·RPC·RLS 테스트 (embedded PostgreSQL, Docker 불필요)                  |
| `pnpm test:e2e`             | Playwright E2E (로컬 Supabase 필요)                                               |
| `pnpm db:types`             | 마이그레이션 기준으로 `src/lib/supabase/database.types.ts` 재생성 (Docker 불필요) |
| `pnpm db:types:local`       | 실행 중인 로컬 Supabase에서 타입 생성 (Docker 필요)                               |

작업을 마치면 `pnpm typecheck && pnpm lint && pnpm test`가 통과해야 합니다.

## Docker 없이 개발하기

DB 로직은 Docker 없이도 검증할 수 있습니다.

- `pnpm test:db`는 [embedded-postgres](https://github.com/leinelissen/embedded-postgres)로 실제 PostgreSQL 17을 띄워 `supabase/migrations`와 `supabase/seed.sql`을 적용하고 RPC·RLS를 테스트합니다. 첫 실행은 DB 초기화로 30초쯤 걸리고, 이후엔 `.cache/`를 재사용합니다.
- Supabase 전용 스키마(auth 등)는 `tests/db/supabase-shim.sql`이 최소한으로 흉내 냅니다.
- 로그인이 필요한 화면과 E2E는 Supabase Auth·API가 있어야 하므로 로컬 Supabase(Docker)나 개발용 Supabase 프로젝트가 필요합니다.

## 폴더 구조

```
src/
├─ app/            (auth) 로그인·초대 / admin 관리자 / m 회원 모바일 / api 웹훅
├─ components/     ui(shadcn) · admin · member
├─ features/       도메인별 queries.ts · actions.ts · schema.ts
├─ lib/            supabase 클라이언트, format(날짜·전화·금액), utils
└─ i18n/           next-intl 설정, messages/ko.json
supabase/          migrations · functions(Edge) · seed.sql · config.toml
tests/             unit · db(RPC·RLS) · e2e
scripts/           DB 도구 (타입 생성 등)
```

## 참고

- Next.js 16 문서는 `node_modules/next/dist/docs/`에 들어 있습니다. `next dev`가 AI 에이전트용 안내 블록을 `AGENTS.md`에 유지합니다.
- 시간은 UTC(`timestamptz`)로 저장하고, 화면에는 센터 시간대(기본 `Asia/Seoul`) 기준으로 `9월 24일 (목) 오후 7:00`처럼 표시합니다.
