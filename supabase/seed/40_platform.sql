-- ─────────────────────────────────────────────────────────────
-- 운영자 콘솔(/platform) 시드
--   admin@gymjjim.test   운영자 (비밀번호 gymjjim1234!)
--   강남점               베이직 요금제 · 이용 중 · 지난달 입금 / 이번 달 미납
--   홍대점               체험 중 (5일 뒤 종료) · 대표 초대 전
--   부산점               프로 요금제 · 정지 (지난달 연체)
-- ─────────────────────────────────────────────────────────────

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000900', 'authenticated',
  'authenticated', 'admin@gymjjim.test', extensions.crypt('gymjjim1234!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"운영자"}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000900', 'a0000000-0000-4000-8000-000000000900',
  jsonb_build_object('sub', 'a0000000-0000-4000-8000-000000000900', 'email', 'admin@gymjjim.test',
    'email_verified', true),
  'email', now(), now(), now());

insert into public.platform_admins (user_id, name)
values ('a0000000-0000-4000-8000-000000000900', '운영자');

-- 강남점: 베이직
update public.centers
set plan_id = (select id from public.plans where code = 'basic'), status_changed_at = now() - interval '200 days'
where id = 'c0000000-0000-4000-8000-000000000001';

-- 홍대점: 체험 · 부산점: 정지
insert into public.centers (id, name, timezone, phone, address, plan_id, status, trial_ends_at, status_changed_at)
values
  ('c0000000-0000-4000-8000-000000000002', '짐찜 요가 홍대점', 'Asia/Seoul', '0233334444',
   '서울특별시 마포구 양화로 45', (select id from public.plans where code = 'trial'), 'trial',
   (now() at time zone 'Asia/Seoul')::date + 5, now() - interval '9 days'),
  ('c0000000-0000-4000-8000-000000000003', '짐찜 크로스핏 부산점', 'Asia/Seoul', '0515556666',
   '부산광역시 해운대구 센텀중앙로 78', (select id from public.plans where code = 'pro'), 'suspended',
   null, now() - interval '3 days');

insert into public.staff (id, center_id, role, name, email, phone, color, invited_at) values
  ('b0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000002', 'owner', '최요가',
   'yoga.owner@gymjjim.test', '01055556666', '#4F46E5', now() - interval '9 days'),
  ('b0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000003', 'owner', '정부산',
   'busan.owner@gymjjim.test', '01077778888', '#4F46E5', now() - interval '400 days');

insert into public.platform_center_notes (center_id, memo) values
  ('c0000000-0000-4000-8000-000000000003', '지난달 요금 미납으로 정지. 입금 확인되면 재개');

-- 청구서: 강남점 지난달 입금 · 이번 달 미납, 부산점 지난달 연체 · 이번 달 미납
insert into public.invoices (center_id, plan_id, period_start, period_end, amount, due_date, status, paid_at)
select i.center_id::uuid, p.id, m.start, (m.start + interval '1 month - 1 day')::date, p.monthly_price,
  m.start + 9, i.status::public.invoice_status,
  case when i.status = 'paid' then (m.start + 5)::timestamptz end
from (values
  ('c0000000-0000-4000-8000-000000000001', 'basic', -1, 'paid'),
  ('c0000000-0000-4000-8000-000000000001', 'basic', 0, 'pending'),
  ('c0000000-0000-4000-8000-000000000003', 'pro', -1, 'pending'),
  ('c0000000-0000-4000-8000-000000000003', 'pro', 0, 'pending')
) as i(center_id, plan_code, month_offset, status)
join public.plans p on p.code = i.plan_code
cross join lateral (
  select (date_trunc('month', now() at time zone 'Asia/Seoul') + make_interval(months => i.month_offset))::date
    as start
) m;
