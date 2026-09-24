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

### 3) 시드 계정 (비밀번호 모두 `gymjjim1234!`)

| 계정                                                | 역할                            | 로그인                                     |
| --------------------------------------------------- | ------------------------------- | ------------------------------------------ |
| `owner@gymjjim.test`                                | 대표                            | `/admin-login`                             |
| `coach.lee@gymjjim.test`, `coach.park@gymjjim.test` | 트레이너                        | `/admin-login`                             |
| `member1@gymjjim.test`                              | 회원 홍길동 (동의 완료)         | `/login` → 이메일 링크 (Mailpit 에서 확인) |
| `member2@gymjjim.test`                              | 회원 김민지 (첫 로그인 동의 전) | `/login` → 이메일 링크                     |

## 로그인 구조

- **관리자**(대표·트레이너): 이메일 + 비밀번호 → `/admin`. 대표가 설정에서 직원을 초대하면 초대 메일 → `/admin/set-password`
- **회원**: 카카오 로그인(주) + 이메일 매직링크(보조) → `/m`
  1. 관리자가 이름 + 전화번호로 회원 등록 → 초대 링크(1회용, 7일) 발송·복사
  2. 회원이 `/invite/<token>` 에서 로그인 → `members.user_id` 자동 연결
  3. 첫 로그인 때 개인정보 수집·이용(필수), 마케팅 수신(선택) 동의 → `/m`
- `src/proxy.ts`(Next 16 의 middleware)가 JWT 의 역할 클레임으로 1차 라우팅하고, 권한이 없으면 `/403`. 레이아웃이 DB 로 다시 확인하고 최종 권한은 RLS·RPC 가 판단합니다.

### 카카오 로그인 설정

1. [카카오 디벨로퍼스](https://developers.kakao.com)에서 앱 생성 → **[앱] > [일반] > [비즈니스 정보]에서 개인 개발자 비즈 앱 전환** (Supabase 는 `account_email` 동의항목을 항상 요청하므로 필요합니다. 전화번호 동의항목은 쓰지 않습니다)
2. [카카오 로그인] 활성화, 동의항목: 닉네임(필수), 프로필 사진(선택), 카카오계정 이메일(선택)
3. Redirect URI 등록: `http://127.0.0.1:54321/auth/v1/callback`(로컬), `https://<project-ref>.supabase.co/auth/v1/callback`(운영)
4. REST API 키·Client Secret 을 `.env.local` 의 `SUPABASE_AUTH_EXTERNAL_KAKAO_CLIENT_ID`·`SUPABASE_AUTH_EXTERNAL_KAKAO_SECRET` 에 넣고 `supabase/config.toml` 의 `[auth.external.kakao] enabled = true`
5. 운영 Supabase 대시보드: Authentication > Providers > Kakao 활성화 + "Allow users without an email" 켜기

### 메일 템플릿

`supabase/templates/*.html` 은 `{{ .RedirectTo }}&token_hash=…` 형식이라 **Redirect URL 허용 목록**(`additional_redirect_urls`, 운영은 대시보드 URL Configuration)에 `https://<도메인>/**` 가 있어야 합니다.

## 알림 (카카오 알림톡)

예약 확정·대기 승격·수업 변경·폐강·전날/2시간 전 리마인드·만료 D-7·잔여 1회·앱 연결 초대, 모두 **정보성 템플릿 9종**만 보냅니다. 자유 문구 발송 기능은 없습니다.

```
RPC(예약·취소·폐강…) ─┐
Cron → Edge Function ─┼─ notification_logs (pending) ─ claim → 템플릿 → 알림톡 어댑터 → finish (sent/failed/skipped)
  (리마인드·D-7 예약) ─┘
```

- 템플릿 원문·변수: `src/features/notifications/templates.ts` (관리자 **설정 > 알림**에서 미리보기)
- 어댑터: `src/features/notifications/channels.ts` — `mock`(기본, 보내지 않고 기록만) · `solapi`. 대행사를 바꿀 때는 어댑터만 추가합니다.
- 발송기: `supabase/functions/send-notifications` (1분마다 Cron 이 호출, `x-cron-secret` 헤더로 확인)
- 규칙: 2시간 전 리마인드는 발송 시각이 21시~08시면 보내지 않습니다(새벽 수업은 전날 20시 리마인드로 대체). 회원이 알림을 끄면 건너뛰지만 폐강·시간 변경은 보냅니다. 보내기 직전에 예약이 취소됐거나 시간이 바뀌었으면 건너뜁니다. 실패하면 5분·10분 뒤 다시 보내고 3번째에 실패로 둡니다.
- SMS 대체발송: 대표가 **설정 > 알림**에서 켭니다(문자 비용 발생).

### 실제 발송 연결 (Solapi)

1. 카카오 비즈니스 채널을 만들고 Solapi 에 연동해 **pfId** 를 받습니다. 발신번호도 등록합니다.
2. 설정 > 알림의 템플릿 원문 9종을 그대로 알림톡 템플릿으로 등록해 검수를 받습니다(원문이 한 글자라도 다르면 발송이 거절됩니다).
3. `supabase/functions/.env.example` 을 참고해 시크릿을 넣습니다. 검수받은 템플릿 ID 는 `SOLAPI_TEMPLATE_IDS` 에 코드별로 적습니다(빈 값인 템플릿은 보내지 않고 `TEMPLATE_NOT_REGISTERED` 로 남습니다).
   ```bash
   pnpm supabase secrets set --env-file supabase/functions/.env
   pnpm supabase functions deploy send-notifications
   ```
4. Cron 작업(`gymjjim-send-notifications`, 1분마다)은 마이그레이션이 등록합니다. SQL Editor 에서 Vault 에 호출 주소와 비밀값을 넣으면 동작을 시작합니다.
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'gymjjim_functions_url');
   select vault.create_secret('<NOTIFY_CRON_SECRET 과 같은 값>', 'gymjjim_cron_secret');
   ```
   로컬 Supabase 에서는 주소로 `http://host.docker.internal:54321/functions/v1` 을 넣고 `pnpm supabase functions serve` 를 켜 둡니다.

## PWA · 웹 푸시

- 회원은 휴대폰 브라우저에서 **홈 화면에 추가**하면 앱처럼 쓸 수 있습니다(시작 화면 `/m`). 아이폰은 Safari 공유 버튼 → "홈 화면에 추가".
- 서비스 워커(Serwist, `src/app/sw.ts`)는 배포 빌드에서만 켜집니다. CSS 와 오프라인 안내(`/offline`)만 미리 받고, 예약·이용권 데이터(Supabase)는 캐시하지 않습니다.
- 웹 푸시는 알림톡의 보조 채널입니다. 회원이 **내 정보 > 알림 설정**에서 기기마다 켜고, 발송기가 같은 안내를 푸시로도 보냅니다(만료된 구독은 자동 정리).
  ```bash
  pnpm dlx web-push generate-vapid-keys
  ```
  공개키는 앱의 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, 공개키·비공개키·`VAPID_SUBJECT` 는 Edge Function 시크릿에 넣습니다.

## E2E 테스트 (Playwright)

로컬 Supabase(Docker)와 시드 데이터가 있어야 합니다. 테스트가 쓰는 프로그램·수업·이용권은 서비스 키로 직접 만들고, 끝나면 숨깁니다.

```bash
pnpm supabase start
pnpm supabase db reset
pnpm exec playwright install chromium
pnpm test:e2e
```

| 시나리오                                                | 화면          |
| ------------------------------------------------------- | ------------- |
| (1) 회원 로그인 → 예약 → 취소                           | 회원 375px    |
| (2) 정원 마감 → 대기 신청 → 취소 발생 → 자동 승격       | 회원 375px    |
| (3) 관리자 수업 생성 → 대리 예약 → 출석 체크 → 되돌리기 | 관리자 1280px |
| (4) 회원 등록 → 이용권 부여 → 정지 → 만료일 연장 확인   | 관리자 1280px |

회원 화면은 카카오·매직링크만 있으므로, 테스트는 시드 회원의 비밀번호로 받은 세션 쿠키를 브라우저에 넣어 로그인합니다.

## 배포 (Vercel + Supabase)

### 1) Supabase

1. [Supabase](https://supabase.com/dashboard)에서 프로젝트를 만듭니다(리전: Seoul).
2. 마이그레이션을 적용합니다. 운영에는 시드를 넣지 않습니다.
   ```bash
   pnpm supabase login
   pnpm supabase link --project-ref <project-ref>
   pnpm supabase db push
   ```
3. **Authentication > URL Configuration**: Site URL `https://<도메인>`, Redirect URLs `https://<도메인>/**`
4. **Authentication > Email Templates**: `supabase/templates/magic_link.html`, `invite.html` 내용을 붙여 넣습니다.
5. **Authentication > Providers > Kakao**: [카카오 로그인 설정](#카카오-로그인-설정)의 키를 넣고 "Allow users without an email" 을 켭니다.
6. 첫 센터와 대표 계정: **Authentication > Users** 에서 대표 이메일로 사용자를 초대한 뒤 SQL Editor 에서 연결합니다(이후 직원은 앱의 설정 > 직원에서 초대).
   ```sql
   with center as (
     insert into public.centers (name, timezone) values ('센터 이름', 'Asia/Seoul') returning id
   )
   insert into public.staff (center_id, user_id, role, name, email)
   select center.id, u.id, 'owner', '대표 이름', u.email
   from center, auth.users u
   where u.email = 'owner@example.com';
   ```
7. 알림: [실제 발송 연결](#실제-발송-연결-solapi)대로 시크릿을 넣고 `send-notifications` 함수를 배포한 뒤 Vault 에 호출 주소·비밀값을 넣습니다. 키를 넣기 전에는 `mock` 으로 기록만 남습니다.

### 2) Vercel

1. 저장소를 Import 합니다(Framework: Next.js, 설치·빌드 명령은 기본값 — `pnpm install`, `pnpm build`).
2. Environment Variables:

   | 이름                                   | 값                                                  |
   | -------------------------------------- | --------------------------------------------------- |
   | `NEXT_PUBLIC_SITE_URL`                 | `https://<도메인>`                                  |
   | `NEXT_PUBLIC_SUPABASE_URL`             | `https://<project-ref>.supabase.co`                 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase **Settings > API Keys** 의 publishable key |
   | `SUPABASE_SECRET_KEY`                  | 같은 곳의 secret key (서버 전용)                    |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`         | 웹 푸시 공개키 (선택)                               |

3. 배포 후 도메인을 연결하고, Supabase 의 Site URL·Redirect URLs 와 카카오 Redirect URI 를 그 도메인으로 맞춥니다.

### 3) 배포 후 확인

- `/admin-login` 대표 로그인 → 설정에서 센터 정보·예약 규칙 저장
- 회원 등록 → 앱 초대 링크로 회원 연결(카카오·이메일) → `/m` 에서 예약·취소
- 설정 > 알림의 **최근 발송 내역**에 예약 확정 알림이 쌓이는지(`mock` 이면 "테스트 발송")
- 휴대폰에서 홈 화면 추가, 내 정보에서 푸시 알림 켜기

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
