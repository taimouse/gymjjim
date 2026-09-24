# gymjjim — Claude Code 단계별 프롬프트

## 사용법
1. 빈 폴더에 `CLAUDE.md`를 먼저 넣고 `claude` 실행
2. 아래 STEP을 **순서대로 하나씩** 붙여넣는다. 각 STEP은 plan 모드(Shift+Tab)에서 계획을 먼저 확인하고 승인
3. STEP이 끝나면 직접 화면 확인 → 커밋 → `/clear` 후 다음 STEP
4. 화면 디자인은 STEP 5 전에 Claude Design으로 핵심 화면 4개(오늘 / 캘린더 / 회원 상세 드로어 / 회원 예약 화면) 초안을 만들고, 직접 다듬은 뒤 코드에 연결하는 걸 추천

---

## STEP 1. 프로젝트 초기 세팅
```
CLAUDE.md를 읽고 프로젝트를 초기화해줘.
- Next.js(App Router) + TypeScript strict + Tailwind v4 + shadcn/ui, pnpm
- 폴더 구조는 CLAUDE.md 8번대로
- Supabase 로컬 개발 환경(supabase init) 구성, .env.example 작성
- next-intl(한국어 전용, messages/ko.json), ESLint/Prettier, Vitest, Playwright 설정
- CLAUDE.md 3-1(한국 센터 전용 설정)의 날짜·전화번호·금액 포맷 유틸을 lib/format.ts에 먼저 만들어줘
- package.json 스크립트: dev, build, typecheck, lint, test, test:e2e, db:types
- 디자인 토큰: globals.css에 CSS 변수로 정의 (라이트/다크)
  - 색: neutral 스케일 + 포인트 색 1개 + 상태색(success/warning/danger/info)
  - radius, 그림자 2단계, 폰트 Pretendard
아직 화면은 만들지 말고, 끝나면 실행 방법을 README에 정리해줘.
```

## STEP 2. DB 스키마 + RLS + 시드
```
CLAUDE.md 4~6번 기준으로 Supabase 마이그레이션을 만들어줘.

테이블:
- centers: name, timezone(기본 Asia/Seoul), booking_settings jsonb(오픈 일수, 예약 마감 분, 무료 취소 시간, 대기 자동승격 on/off)
- staff: center_id, user_id, role(owner|staff), name, color
- members: center_id, user_id(nullable), name, phone, birth, gender, memo, tags text[], status, joined_at,
  privacy_agreed_at, marketing_agreed_at(nullable), notify_enabled, deleted_at
- pass_products: center_id, name, type(period|count|period_count), duration_days, total_count, period_limit_count, period_limit_unit(week|month), price, is_active
- member_passes: center_id, member_id, product_id, start_date, end_date, total_count, remaining_count, status, paid_amount, paid_at
- pass_holds: member_pass_id, start_date, end_date, reason
- programs: center_id, name, type(group|private), default_capacity, duration_min, color, description, default_instructor_id
- program_allowed_products: program_id, product_id
- sessions: center_id, program_id, instructor_id, starts_at, ends_at, capacity, status(scheduled|cancelled), recurrence_group_id, note
- bookings: center_id, session_id, member_id, member_pass_id, status, waitlist_position, booked_by(member|staff), cancelled_at, attended_at
- member_invites: center_id, member_id, token, expires_at, used_at
- notification_logs: center_id, member_id, type, channel(alimtalk|sms|webpush), template_code, payload, status, fallback_used, sent_at

요구사항:
- 모든 테이블 RLS. staff는 자기 center만, member는 본인 데이터만 조회
- member는 bookings를 직접 insert/update 불가 (RPC로만)
- 인덱스: sessions(center_id, starts_at), bookings(session_id, status), members(center_id, phone) 등
- members.phone은 숫자만 저장, 뒷 4자리 검색용 generated column 추가
- 시드: 센터 1, owner 1, staff 2, 회원 30명, 이용권 상품 4종, 프로그램 5개, 이번 주~다음 주 세션, 예약 샘플
- 끝나면 pnpm db:types로 타입 생성
```

## STEP 3. 예약 엔진(RPC) + 테스트
```
예약 핵심 로직을 Postgres 함수로 구현하고 테스트까지 작성해줘. CLAUDE.md 5번·6번 규칙을 그대로 따를 것.

함수:
- book_session(session_id, member_pass_id?) → booked 또는 waitlisted
  이용권 자동 선택(만료 임박 순), 오픈/마감/중복 시간/정지/만료/기간 내 횟수 제한 검증,
  SELECT ... FOR UPDATE로 정원 초과 방지
- cancel_booking(booking_id) → 무료 취소면 횟수 복구, 아니면 late_cancelled. 이후 대기 1순위 자동 승격
- promote_waitlist(session_id) (내부용)
- set_attendance(booking_id, status: attended|no_show|booked) ← 되돌리기 지원
- staff_book_for_member(session_id, member_id, override_rules boolean, allow_over_capacity boolean)
- cancel_session(session_id) ← 폐강: 전체 예약 취소 + 횟수 복구 + 알림 대상 반환
- create_hold(member_pass_id, start_date, end_date) ← 정지 + 만료일 연장, 정지 기간 내 예약이 있으면 에러

에러는 코드로 반환 (SESSION_FULL, BOOKING_NOT_OPEN, BOOKING_CLOSED, PASS_EXPIRED, PASS_ON_HOLD,
PERIOD_LIMIT_REACHED, DUPLICATE_TIME, NO_VALID_PASS 등).
features/booking에 RPC를 감싼 타입 안전한 함수와 에러코드 → i18n 키 매핑도 만들어줘.

테스트 (Vitest + 로컬 Supabase):
- 정원 10명 수업에 15명 동시 예약 → booked 10, waitlisted 5, 정원 초과 0
- 무료 취소 → 횟수 복구 + 대기 1순위 승격
- 늦은 취소 → 차감 유지
- 정지 중 이용권 → 예약 거부
- 주 3회 제한 → 4번째 예약 거부
- 폐강 → 모든 예약 취소 + 복구
```

## STEP 4. 인증 & 역할
```
인증과 역할 기반 라우팅을 만들어줘.
- 관리자(owner/staff): 이메일 + 비밀번호 → /admin
- 회원: 카카오 로그인(Supabase Kakao provider, 최신 문서 확인) + 이메일 매직링크 보조 → /m
  카카오 전화번호 제공 항목은 비즈앱 검수가 필요하니 쓰지 말고, 회원 연결은 아래 초대 토큰으로만
- 회원 연결 흐름: 관리자가 이름+전화번호로 회원 등록 → 초대 링크(member_invites 1회용 토큰) 발송
  → 회원이 링크로 로그인하면 members.user_id 자동 연결
- 첫 로그인 시 개인정보 수집·이용 동의(필수), 마케팅 수신 동의(선택) 화면 → 동의 일시 저장
- middleware로 역할별 접근 제어, 권한 없으면 403 페이지
- owner는 설정에서 staff 초대/권한 변경
```

## STEP 5. 관리자 레이아웃 + 프로그램·이용권
```
관리자 화면 뼈대와 프로그램·이용권 관리를 만들어줘.
- 레이아웃: 왼쪽 사이드바(오늘 / 캘린더 / 회원 / 프로그램·이용권 / 설정),
  상단에 ⌘K 검색 + 센터명 + 계정 메뉴. 태블릿 폭에서는 사이드바 아이콘만
- 프로그램: 카드 목록, 생성/편집은 오른쪽 드로어
  필드: 이름, 그룹/개인, 기본 정원, 소요시간, 색상, 기본 강사, 사용 가능한 이용권
- 이용권 상품: 테이블 목록 + 드로어 편집
  필드: 기간권/횟수권/기간+횟수, 기간, 횟수, 기간 내 이용 제한(주/월 n회), 가격, 판매중 on/off
- 폼은 RHF + Zod, 저장 후 토스트, 가격은 원 단위 콤마 입력
- 설정 페이지: 예약 규칙(CLAUDE.md 5번 값들), 직원 관리, 센터 정보·시간대
```

## STEP 6. 회원 관리
```
회원 관리 화면을 만들어줘.
- 목록: 검색(이름 / 전화 뒷 4자리, 목록에서는 010-****-5678처럼 가운데 마스킹), 필터 칩(활성 / 만료 임박 D-7 / 잔여 1~2회 / 만료 / 정지 중), 정렬, 페이지네이션
- 각 행에 대표 이용권 상태 뱃지 ("잔여 3회 · D-12")
- 회원 상세: 오른쪽 드로어
  상단 이용권 카드(잔여 횟수, 만료 D-day 크게, 정지 버튼)
  탭: 예약 이력 / 이용권 이력 / 메모
- 이용권 부여: 상품 선택 → 시작일 → 만료일·횟수 자동 계산 → 결제 금액 기록
- 정지 등록: 기간 선택 → 연장될 만료일 미리보기 → 확정
- 회원 등록은 이름 + 전화번호 + 개인정보 동의 체크만 필수 (현장 등록 시 관리자가 동의 확인)
- 회원 삭제 요청 처리: 이름·전화번호 마스킹, 예약 통계만 보존
- CSV 가져오기: 업로드 → 컬럼 매핑 → 미리보기(오류 행 표시) → 확정 (다른 프로그램에서 옮겨오는 센터용)
- ⌘K 검색에서 회원을 고르면 어느 화면에서든 바로 드로어 열기
```

## STEP 7. 캘린더
```
관리자 캘린더를 FullCalendar(무료 플러그인만)로 만들어줘.
- 기본 주간 뷰, 일/월 전환, 오늘 버튼
- 이벤트 배경은 프로그램 색, 왼쪽 테두리는 강사 색
- 각 이벤트에 "예약 8/10 · 대기 2" 표시, 마감이면 표시 변경
- 필터: 강사, 프로그램 (강사별 컬럼 뷰는 premium이라 필터로 대체)
- 빈 시간 드래그 → 수업 생성 드로어
  프로그램 선택 시 정원/시간 자동 입력, 반복(요일 선택 + 종료일)
- 이벤트 클릭 → 세션 드로어
  예약자 명단(출석/노쇼 토글 + 되돌리기 토스트), 대기자 명단,
  회원 대리 예약(⌘K 검색 재사용), 수업 수정, 폐강
- 이벤트 드래그로 시간 이동 → 확인창에 "예약자에게 알림 보내기" 체크박스
- 반복 수업 수정 시 "이 수업만 / 이후 전체" 선택
- Supabase Realtime으로 다른 기기의 예약이 들어오면 숫자 실시간 반영
```

## STEP 8. 회원용 모바일 화면
```
회원용 모바일 화면(/m)을 만들어줘. 목표: 앱을 열고 3탭 안에 예약 완료.
- 하단 탭 3개: 예약 / 내 예약 / 내 정보
- 예약 탭: 상단 가로 스크롤 날짜 칩(오늘 ~ 예약 오픈 마지막 날)
  → 그날 수업 카드 리스트(시간, 프로그램, 강사, "3자리 남음" / "대기 2명" / "마감")
- 카드 탭 → 바텀시트(수업 정보, 사용될 이용권, 취소 규칙 한 줄 안내) → [예약하기] 한 번
- 마감이면 [대기 신청] + 내 대기 순번 표시
- 내 예약: 다가오는 예약 / 지난 기록
  취소 시 "지금 취소하면 횟수가 복구됩니다" 또는 "차감됩니다"를 명확히 안내
- 내 정보: 이용권 카드(잔여 횟수, D-day, 정지 상태), 알림 설정, 로그아웃
- 예약 탭 상단에 "지난주와 같은 수업 예약" 빠른 버튼 (가능한 수업만 체크된 상태로 확인 후 일괄 예약)
- 로딩 스켈레톤, 에러 코드별 친절한 메시지
```

## STEP 9. 오늘(관리자 첫 화면)
```
관리자 첫 화면 "오늘"을 만들어줘. 통계보다 오늘 운영에 집중.
- 오늘의 수업 타임라인: 시간순 카드(예약/정원, 대기, 진행 중 강조). 클릭 → STEP 7 세션 드로어 재사용
- 챙겨야 할 회원: 만료 D-7 이내 / 잔여 1~2회 / 최근 2주 미출석 → 각 항목에서 바로 회원 드로어·이용권 부여
- 숫자는 4개만: 오늘 예약 수, 오늘 출석률, 이번 달 신규 회원, 이번 달 재등록
- 주간/월간 통계는 탭으로 분리 (막대 차트 1~2개면 충분)
```

## STEP 10. 알림 (카카오 알림톡 중심)
```
알림 시스템을 만들어줘. 채널은 어댑터 구조로 분리해서 발송대행사를 바꿔도 코드 수정이 최소화되게.
- 주 채널: 카카오 알림톡 (발송대행사 API — Solapi 기준으로 구현하되 인터페이스로 추상화)
  실제 키 연결 전까지는 mock 어댑터로 콘솔/DB 기록만
- 보조: 알림톡 실패 시 SMS 대체발송(옵션), PWA 웹 푸시
- 알림톡은 정보성만 가능하고 템플릿 사전 검수가 필요하므로
  features/notifications/templates.ts에 "템플릿 코드 + 변수 + 미리보기 문구"로 관리하고, 자유 문구 발송 기능은 만들지 마
- 템플릿(정보성 문구로 초안 작성해줘):
  예약 확정 / 대기 → 확정 승격 / 수업 시간 변경 / 수업 폐강 / 전날 리마인드 / 시작 2시간 전 리마인드 /
  이용권 만료 D-7 / 잔여 1회 / 초대 링크
- 발송 예약은 Supabase Cron + Edge Function
- "2시간 전 리마인드" 발송 시각이 21시~08시에 걸리면 보내지 않음 (새벽 수업은 전날 리마인드로 대체)
- 결과는 notification_logs에 기록, 관리자 설정에 최근 발송 내역 화면
- 회원 알림 설정(알림 끄기) 반영. 단, 수업 폐강·변경은 설정과 무관하게 발송
```

## STEP 11. PWA + 마무리
```
마무리 작업을 해줘.
- Serwist로 PWA (홈 화면 추가, 아이콘, 오프라인 안내 페이지, 웹 푸시 구독)
- Playwright E2E
  (1) 회원 로그인 → 예약 → 취소
  (2) 정원 마감 → 대기 신청 → 취소 발생 → 자동 승격
  (3) 관리자 수업 생성 → 대리 예약 → 출석 체크 → 되돌리기
  (4) 회원 등록 → 이용권 부여 → 정지 → 만료일 연장 확인
- 보안: 다른 센터·다른 회원 데이터에 접근 불가한지 RLS 테스트
- 접근성(키보드 이동, 포커스 표시, 명도 대비)과 375px 모바일 레이아웃 점검
- README에 배포 절차(Vercel + Supabase) 정리
```

---

## Phase 2 백로그 (MVP 이후, 실제 요청이 쌓이면)
- 태블릿 QR / 전화번호 체크인
- 이용권 온라인 결제 (토스페이먼츠) + 결제 완료 시 이용권 자동 부여
- 정기 예약 (매주 같은 수업 자동 예약)
- 1:1 PT: 트레이너 가능 시간 기반 예약
- 좌석 배정 (스피닝 등 필요한 센터만)
- 락커, 전자계약서, 급여 정산 — 요청이 반복될 때만 검토
