# gymjjim — 짐 예약·회원관리 시스템

> Claude Code가 매 세션마다 읽는 프로젝트 규칙 파일. 저장소 루트에 둔다.

## 1. 무엇을 만드는가
헬스장·PT샵·그룹운동 센터를 위한 **예약 중심** 회원관리 웹앱.

- 회원: 스마트폰에서 **3탭 안에** 수업 예약/취소, 내 이용권 확인
- 관리자: 캘린더로 일정 한눈에 보기, 예약자·출석 관리, 프로그램·이용권·회원 관리
- 벤치마크: 어시스트핏 CRM. **기능과 흐름만 참고**하고 화면 디자인·문구·로고·이미지는 복제하지 않는다.
- 원칙: 기능은 적게, 조작은 짧게. 새 기능을 제안할 때는 "이게 없으면 센터 운영이 곤란한가?"부터 따진다.

## 2. 역할
| role | 권한 | 주 사용 기기 |
|---|---|---|
| owner | 센터 대표. 모든 권한 + 설정·직원 관리 | PC |
| staff | 트레이너/스태프. 캘린더·예약·출석·회원 조회/수정 (설정·삭제 불가) | PC/태블릿/폰 |
| member | 회원. 본인 예약·이용권만 | 폰 |
| platform admin | gymjjim 운영자(`platform_admins`). 전체 센터·요금제·청구 관리 (`/platform`). 센터 업무 데이터는 보지 않는다 | PC |

- 요금제(`plans`)의 회원·직원 한도는 DB 트리거가 검사한다 (`PLAN_MEMBER_LIMIT`, `PLAN_STAFF_LIMIT`)
- 정지·해지(`centers.status` = `suspended`·`closed`)된 센터는 권한 헬퍼(`staff_center_ids` 등)에서 빠져 RLS·RPC 가 모두 막는다. 알림도 건너뛴다
- 결제는 1단계 수기 관리: 청구서(`invoices`) 발행 → 입금 확인. 토스페이먼츠 자동결제는 다음 단계

## 3. 기술 스택 (임의 변경·라이브러리 추가 금지. 필요하면 먼저 제안)
- Next.js (App Router, 최신 안정판) + TypeScript `strict`, 패키지 매니저 pnpm
- Tailwind CSS v4 + shadcn/ui + lucide-react
- Supabase: Postgres, Auth, RLS, Realtime, Edge Functions, Cron
- 캘린더: FullCalendar — **MIT 무료 플러그인만** (daygrid, timegrid, interaction, rrule). premium 플러그인 사용 금지
- 폼: React Hook Form + Zod (스키마는 서버/클라이언트 공유)
- 서버 상태: TanStack Query
- 날짜: date-fns v4 + @date-fns/tz
- 문구 관리: next-intl (한국어 전용. 화면 문구를 messages/ko.json 한 곳에 모아 관리)
- PWA: Serwist
- 알림: 카카오 알림톡(발송대행사 API) + 웹 푸시
- 테스트: Vitest(로직/RPC), Playwright(E2E)
- 배포: Vercel + Supabase

## 3-1. 한국 센터 전용 설정
- 시간대 `Asia/Seoul` 고정. 날짜 표기 예: `9월 24일 (목) 오후 7:00`
- 전화번호는 숫자만 저장, 표시는 `010-1234-5678`
- 금액은 원 단위 콤마 표기 (`150,000원`)
- 폰트: Pretendard
- 회원 로그인: 카카오 로그인(Supabase Kakao provider) + 이메일 매직링크 보조
  - 카카오 전화번호 제공 항목은 비즈앱 검수가 필요하므로 의존하지 않는다. 회원 연결은 초대 토큰으로 처리
- 알림: 카카오 알림톡이 주 채널, 웹 푸시는 보조
  - 알림톡은 **정보성 메시지만** 가능 (예약 확정, 리마인드, 만료 안내 등). 광고성 문구 금지
  - 템플릿은 사전 검수가 필요하므로 코드에서는 템플릿 코드 + 변수 방식으로만 발송
  - 알림톡 실패 시 SMS 대체발송 옵션
- 개인정보 (개인정보 보호법 대응)
  - 회원 등록 시 개인정보 수집·이용 동의 일시 저장 (`privacy_agreed_at`)
  - 마케팅 수신 동의는 별도 항목, 선택 (`marketing_agreed_at`)
  - 탈퇴·삭제 요청 회원은 이름·전화번호를 마스킹하고 예약 통계만 남긴다
  - 관리자 화면 목록에서는 전화번호 가운데 자리 마스킹, 상세에서만 전체 표시
- 결제(2단계): 토스페이먼츠

## 4. 도메인 용어 (코드에서도 이 이름을 쓴다)
| 용어 | 테이블 | 의미 |
|---|---|---|
| Center | centers | 센터(지점). 모든 데이터의 소유 단위 |
| Staff | staff | 대표·트레이너. 캘린더 색상 보유 |
| Member | members | 회원 |
| Program | programs | 수업 템플릿. 예) 아침 요가, WOD, 1:1 PT |
| Session | sessions | 캘린더에 실제로 잡힌 1회 수업 |
| Pass Product | pass_products | 판매용 이용권 상품 (기간권 / 횟수권 / 기간+횟수) |
| Member Pass | member_passes | 회원이 보유한 이용권 (잔여 횟수, 시작·만료일) |
| Pass Hold | pass_holds | 이용권 정지(홀딩) 기간 |
| Booking | bookings | 예약. status: `booked` `waitlisted` `cancelled` `late_cancelled` `attended` `no_show` |

## 5. 예약 규칙 (기본값. 센터 설정에서 변경 가능)
- 예약 오픈: 수업 시작 7일 전부터
- 예약 마감: 시작 30분 전
- 무료 취소: 시작 3시간 전까지 → 횟수 복구
- 늦은 취소(`late_cancelled`)·노쇼(`no_show`): 차감 유지
- 차감 시점: 예약 시 차감, 무료 취소 시 복구
- 정원 초과 시 `waitlisted`. 취소가 나오면 대기 1순위 자동 승격 + 알림 (예약 마감 전까지만)
- 같은 회원의 시간이 겹치는 중복 예약 금지
- 이용권별 기간 내 이용 횟수 제한 옵션 (예: 주 3회)
- 정지 중인 이용권으로는 예약 불가. 정지 일수만큼 만료일 자동 연장
- 프로그램마다 "사용 가능한 이용권 상품"을 지정. 이용권은 만료 임박 순으로 자동 선택
- 관리자 대리 예약은 오픈/마감 규칙을 무시할 수 있다 (정원은 초과 옵션 확인 후)

## 6. 반드시 지킬 구현 규칙
- 모든 업무 테이블에 `center_id` + RLS. 단일 센터로 시작해도 멀티센터 구조 유지
- 예약·취소·대기승격·출석·노쇼·폐강은 **Postgres 함수(RPC) 안에서 트랜잭션 + `SELECT ... FOR UPDATE`** 로 처리. 클라이언트에서 정원을 계산해 insert 하지 않는다
- RPC 에러는 코드로 반환 (`SESSION_FULL`, `BOOKING_CLOSED`, `PASS_EXPIRED`, `PASS_ON_HOLD`, `WEEKLY_LIMIT`, `DUPLICATE_TIME` 등) → 화면에서 i18n 메시지로 변환
- 시간은 `timestamptz`(UTC) 저장, 표시는 `centers.timezone` 기준
- 권한은 서버(RLS/RPC)에서 최종 검증. UI에서 숨기는 것만으로 권한 처리 금지
- 삭제는 soft delete(`deleted_at`) — 회원·예약 이력 보존
- 화면 문자열 하드코딩 금지 → next-intl 메시지 키 사용
- `any` 금지, 외부 입력은 전부 Zod로 검증
- 한 파일이 300줄을 넘으면 분리
- `'use client'` 파일이 export 한 상수·일반 함수는 서버 컴포넌트에서 쓰지 않는다 (클라이언트 참조로 바뀌어 런타임에야 터진다). 서버도 쓰는 값은 별도 모듈에 둔다

## 7. UI/UX 원칙
- 관리자: PC 우선(1280px), 태블릿 대응. 회원: 모바일 우선(375px)
- 관리자 사이드바 메뉴는 **5개로 고정**: 오늘 / 캘린더 / 회원 / 프로그램·이용권 / 설정
- 상세 보기·편집은 페이지 이동 대신 **오른쪽 사이드 드로어** (회원 화면은 바텀시트)
- 되돌릴 수 있는 작업(출석 체크 등)은 확인창 없이 실행 후 "되돌리기" 토스트. 되돌릴 수 없는 작업(삭제, 늦은 취소 차감, 폐강)만 확인창
- 회원 검색은 이름 또는 **전화번호 뒷 4자리**로 즉시 검색. 어디서든 `⌘K / Ctrl+K`
- 수업 상태는 색 + 텍스트를 함께 표시: 예약가능 / 마감임박 / 대기가능 / 마감 / 종료
- 잔여석, 잔여 횟수, 만료 D-day 같은 **숫자를 크게** 보여준다
- 터치 타깃 44px 이상, 본문 16px 이상
- 모든 목록에 빈 상태(empty state)와 로딩 스켈레톤
- shadcn 기본 스타일을 그대로 쓰지 말고 `app/globals.css`의 디자인 토큰(색·radius·폰트)을 따른다

## 8. 폴더 구조
```
src/
├─ app/
│  ├─ (auth)/        로그인·초대 수락
│  ├─ admin/         관리자: today, calendar, members, programs, settings
│  ├─ m/             회원 모바일: book, my-bookings, me
│  ├─ platform/      운영자 콘솔: 대시보드, centers, plans, invoices (메뉴 4개, 관리자 메뉴와 별개)
│  └─ api/           웹훅 등 최소한만
├─ components/
│  ├─ ui/            shadcn
│  ├─ admin/
│  └─ member/
├─ features/         도메인별: booking, members, passes, programs, sessions, notifications
│                    (각 폴더에 queries.ts, actions.ts, schema.ts)
├─ lib/              supabase 클라이언트, date, utils
└─ i18n/             messages/ko.json
supabase/
├─ migrations/
├─ functions/        Edge Functions (알림 발송)
└─ seed.sql
tests/
├─ unit/
├─ db/               마이그레이션·RPC·RLS 테스트 (embedded PostgreSQL)
└─ e2e/
scripts/             DB 도구 (타입 생성 등)
```

## 9. 작업 방식
- 큰 작업은 계획을 먼저 제시하고 승인 후 구현
- 작업이 끝나면 `pnpm typecheck && pnpm lint && pnpm test` 통과 확인
- DB 변경은 반드시 `supabase/migrations`의 마이그레이션 파일로 하고, 이후 `pnpm db:types`로 타입 재생성
- 예약 RPC를 바꾸면 관련 테스트도 함께 수정
- 모르는 라이브러리 API는 추측하지 말고 최신 문서를 확인
  - Next.js 16 문서는 `node_modules/next/dist/docs/`에 번들되어 있다 (`AGENTS.md` 참고). `middleware`는 `proxy.ts`로 이름이 바뀌었다
- Docker 없이도 `pnpm test:db`(embedded PostgreSQL)로 마이그레이션·RPC·RLS를 검증할 수 있다
- 화면 확인·E2E 는 `pnpm dev:local`(도커 없는 로컬 스택: embedded PostgreSQL + PostgREST + 개발용 인증·Realtime, `scripts/dev-stack`)로 한다. E2E 는 `E2E_BROWSER_CHANNEL=msedge pnpm test:e2e`
  - 로컬 스택에서는 로그인 없이 시드 계정으로 들어간다: `/admin` 대표, `/admin?as=staff` 트레이너, `/m` 회원 (`src/lib/auth/dev-login.ts`). 운영 빌드에서는 항상 꺼진다
- `src/features/notifications`의 templates·solapi·channels·dispatch는 Edge Function(Deno)도 가져다 쓴다. 상대 경로 + `.ts` 확장자로만 import 하고 `@/` 경로·Next 전용 모듈은 쓰지 않는다 (zod 는 함수의 `deno.json`이 연결)
