-- ─────────────────────────────────────────────────────────────
-- 시드: 회원 이용권 · 정지
-- 만료 임박(D-7 이내) · 잔여 1~2회 · 만료 · 정지 중 · 재등록 상태를 골고루 만든다.
-- start/end 는 오늘(Asia/Seoul) 기준 일수, total/remaining 은 횟수권에서만 사용
-- ─────────────────────────────────────────────────────────────
with today as (
  select (now() at time zone 'Asia/Seoul')::date as d
),
spec(member_no, product_no, start_offset, end_offset, remaining) as (
  values
    (1, 2, -20, 69, null),   -- 3개월 주3회권 (로그인 회원 홍길동)
    (2, 3, -55, 4, 3),       -- 10회권 D-4, 시드 예약 1회 차감 후 잔여 2 (로그인 회원 김민지)
    (3, 1, -45, -16, null),  -- 지난 이용권(만료)
    (3, 1, -15, 14, null),   -- 재등록
    (4, 1, -10, 19, null),
    (5, 1, -5, 24, null),
    (6, 1, -20, 9, null),
    (7, 3, -30, 29, 1),      -- 잔여 1회
    (8, 1, -27, 2, null),    -- D-2
    (9, 2, -40, 56, null),   -- 정지 중 (정지 7일만큼 만료일 연장)
    (10, 4, -15, null, 7),   -- PT 10회 (무기한 횟수권)
    (11, 2, -30, 59, null),
    (12, 1, -12, 17, null),
    (13, 3, -20, 39, 6),
    (14, 1, -3, 26, null),
    (15, 2, -60, 29, null),
    (16, 3, -10, 49, 9),
    (17, 1, -25, 4, null),   -- D-4
    (18, 2, -5, 84, null),
    (19, 3, -40, 19, 2),     -- 잔여 2회
    (20, 1, -1, 28, null),
    (21, 1, -60, -31, null), -- 만료
    (22, 1, -50, -21, null),
    (23, 3, -90, -31, 4),
    (24, 1, -40, -11, null),
    (25, 2, -120, -31, null),
    (26, 1, -2, 27, null),   -- 이번 달 신규
    (27, 3, 0, 59, 10)
)
insert into public.member_passes (
  center_id, member_id, product_id, name, type, start_date, end_date, total_count, remaining_count,
  period_limit_count, period_limit_unit, paid_amount, paid_at, created_by
)
select
  p.center_id,
  ('d0000000-0000-4000-8000-' || lpad(s.member_no::text, 12, '0'))::uuid,
  p.id,
  p.name,
  p.type,
  t.d + s.start_offset,
  case when s.end_offset is null then null else t.d + s.end_offset end,
  p.total_count,
  case when p.total_count is null then null else s.remaining end,
  p.period_limit_count,
  p.period_limit_unit,
  p.price,
  ((t.d + s.start_offset) + time '10:00') at time zone 'Asia/Seoul',
  'b0000000-0000-4000-8000-000000000001'
from spec s
cross join today t
join public.pass_products p
  on p.id = ('e0000000-0000-4000-8000-' || lpad(s.product_no::text, 12, '0'))::uuid;

-- 9번 회원: 어제부터 7일간 정지 (만료일은 위에서 이미 7일 연장해 둠)
insert into public.pass_holds (center_id, member_pass_id, start_date, end_date, reason, created_by)
select mp.center_id, mp.id, t.d - 1, t.d + 5, '해외 출장', 'b0000000-0000-4000-8000-000000000001'
from public.member_passes mp
cross join (select (now() at time zone 'Asia/Seoul')::date as d) t
where mp.member_id = 'd0000000-0000-4000-8000-000000000009';
