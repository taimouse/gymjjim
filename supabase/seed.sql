-- ─────────────────────────────────────────────────────────────
-- 로컬 개발용 시드. `pnpm supabase db reset` 때 마이그레이션 다음에 실행된다.
-- 날짜는 실행 시점(Asia/Seoul) 기준으로 이번 주 월요일 ~ 다음 주 일요일 수업을 만든다.
--
-- 로그인 계정 (비밀번호 모두 gymjjim1234!)
--   owner@gymjjim.test        대표 김대표
--   coach.lee@gymjjim.test    트레이너 이코치
--   coach.park@gymjjim.test   트레이너 박코치
--   member1@gymjjim.test      회원 홍길동 (첫 로그인 동의 완료)
--   member2@gymjjim.test      회원 김민지 (첫 로그인 동의 전)
-- ─────────────────────────────────────────────────────────────

-- 1) 인증 사용자
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('gymjjim1234!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', u.name), now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'owner@gymjjim.test', '김대표'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'coach.lee@gymjjim.test', '이코치'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'coach.park@gymjjim.test', '박코치'),
  ('a0000000-0000-4000-8000-000000000101'::uuid, 'member1@gymjjim.test', '홍길동'),
  ('a0000000-0000-4000-8000-000000000102'::uuid, 'member2@gymjjim.test', '김민지')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@gymjjim.test';

-- 2) 센터
insert into public.centers (id, name, timezone, phone, address)
values ('c0000000-0000-4000-8000-000000000001', '짐찜 피트니스 강남점', 'Asia/Seoul', '0212345678',
  '서울특별시 강남구 테헤란로 123');

-- 3) 직원
insert into public.staff (id, center_id, user_id, role, name, email, phone, color) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000001', 'owner', '김대표', 'owner@gymjjim.test', '01011112222', '#4F46E5'),
  ('b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000002', 'staff', '이코치', 'coach.lee@gymjjim.test', '01022223333', '#0EA5E9'),
  ('b0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-000000000003', 'staff', '박코치', 'coach.park@gymjjim.test', '01033334444', '#F97316');

-- 4) 회원 30명 (1·2번은 로그인 계정과 연결)
insert into public.members (
  id, center_id, user_id, name, phone, birth, gender, tags, joined_at,
  privacy_agreed_at, marketing_agreed_at, onboarded_at
)
select
  ('d0000000-0000-4000-8000-' || lpad(n.i::text, 12, '0'))::uuid,
  'c0000000-0000-4000-8000-000000000001',
  case n.i when 1 then 'a0000000-0000-4000-8000-000000000101'::uuid
           when 2 then 'a0000000-0000-4000-8000-000000000102'::uuid end,
  n.name,
  '010' || lpad(((n.i * 7919 + 1234) % 10000)::text, 4, '0') || lpad(((n.i * 4729 + 5678) % 10000)::text, 4, '0'),
  date '1978-03-01' + (n.i * 397 % 9000),
  n.gender::public.gender,
  case n.i % 5 when 0 then '{아침반}'::text[] when 1 then '{PT}'::text[] when 2 then '{재등록}'::text[]
               when 4 then '{저녁반}'::text[] else '{}'::text[] end,
  j.joined_at,
  j.joined_at,
  case when n.i % 3 = 0 then j.joined_at end,
  case when n.i = 1 then now() end
from (values
  (1, '홍길동', 'male'), (2, '김민지', 'female'), (3, '이서준', 'male'), (4, '박지우', 'female'),
  (5, '최도윤', 'male'), (6, '정하은', 'female'), (7, '강시우', 'male'), (8, '조서연', 'female'),
  (9, '윤예준', 'male'), (10, '장수아', 'female'), (11, '임지호', 'male'), (12, '한지유', 'female'),
  (13, '오건우', 'male'), (14, '서채원', 'female'), (15, '신우진', 'male'), (16, '권다은', 'female'),
  (17, '황선우', 'male'), (18, '안서아', 'female'), (19, '송민준', 'male'), (20, '류하린', 'female'),
  (21, '전현우', 'male'), (22, '홍지아', 'female'), (23, '고준서', 'male'), (24, '문윤서', 'female'),
  (25, '양도현', 'male'), (26, '손예린', 'female'), (27, '배승현', 'male'), (28, '백소윤', 'female'),
  (29, '허지훈', 'male'), (30, '남가은', 'female')
) as n(i, name, gender)
cross join lateral (
  -- 26~30번은 이번 달 신규 회원
  select case when n.i > 25 then now() - make_interval(days => n.i - 26)
              else now() - make_interval(days => 40 + (n.i * 13) % 300) end as joined_at
) j;

-- 5) 이용권 상품 4종
insert into public.pass_products (id, center_id, name, type, duration_days, total_count,
  period_limit_count, period_limit_unit, price, sort_order) values
  ('e0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   '1개월 자유이용권', 'period', 30, null, null, null, 150000, 1),
  ('e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
   '3개월 주3회권', 'period', 90, null, 3, 'week', 330000, 2),
  ('e0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001',
   '10회권 (2개월)', 'period_count', 60, 10, null, null, 200000, 3),
  ('e0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001',
   'PT 10회', 'count', null, 10, null, null, 700000, 4);

-- 6) 프로그램 5개 + 사용 가능한 이용권
insert into public.programs (id, center_id, name, type, default_capacity, duration_min, color,
  description, default_instructor_id, sort_order) values
  ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', '아침 요가', 'group',
   12, 60, '#A7F3D0', '하루를 여는 60분 빈야사 요가', 'b0000000-0000-4000-8000-000000000002', 1),
  ('f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', '크로스핏 WOD', 'group',
   16, 60, '#FECACA', '오늘의 운동(WOD) 그룹 수업', 'b0000000-0000-4000-8000-000000000003', 2),
  ('f0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', '필라테스 기구', 'group',
   6, 50, '#DDD6FE', '리포머 기구 필라테스 소그룹', 'b0000000-0000-4000-8000-000000000002', 3),
  ('f0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', '저녁 스피닝', 'group',
   20, 45, '#BFDBFE', '음악과 함께하는 실내 사이클', 'b0000000-0000-4000-8000-000000000002', 4),
  ('f0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', '1:1 PT', 'private',
   1, 50, '#FDE68A', '담당 트레이너와 1:1 수업', 'b0000000-0000-4000-8000-000000000002', 5);

insert into public.program_allowed_products (center_id, program_id, product_id)
select 'c0000000-0000-4000-8000-000000000001', p.program_id::uuid, p.product_id::uuid
from (values
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000003'),
  ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003'),
  ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000002'),
  ('f0000000-0000-4000-8000-000000000004', 'e0000000-0000-4000-8000-000000000003'),
  ('f0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000004')
) as p(program_id, product_id);

-- 이용권·세션·예약은 supabase/seed/*.sql 에서 이어서 만든다 (config.toml [db.seed] sql_paths)
