-- ─────────────────────────────────────────────────────────────
-- 시드: 이번 주 월요일 ~ 다음 주 일요일(14일) 수업
-- 요일(isodow 1=월 … 7=일), 시작 시각은 센터 시간대(Asia/Seoul) 기준
-- ─────────────────────────────────────────────────────────────
with week as (
  select date_trunc('week', now() at time zone 'Asia/Seoul')::date as monday
),
template(program_no, instructor_no, dows, start_time, minutes, capacity) as (
  values
    (1, 2, '{1,3,5}'::int[], time '07:00', 60, 12),   -- 아침 요가 · 이코치
    (2, 3, '{1,2,3,4,5}'::int[], time '19:00', 60, 16), -- WOD · 박코치
    (2, 3, '{6}'::int[], time '10:00', 60, 16),       -- 토요 WOD
    (3, 2, '{2,4}'::int[], time '12:00', 50, 6),      -- 필라테스 점심
    (3, 2, '{2,4}'::int[], time '20:30', 50, 6),      -- 필라테스 저녁
    (4, 2, '{1,3,5}'::int[], time '20:30', 45, 20),   -- 저녁 스피닝
    (5, 2, '{2,4}'::int[], time '15:00', 50, 1),      -- 1:1 PT · 이코치
    (5, 3, '{3}'::int[], time '16:00', 50, 1)         -- 1:1 PT · 박코치
),
grouped as materialized (
  select t.*, gen_random_uuid() as recurrence_group_id from template t
)
insert into public.sessions (
  center_id, program_id, instructor_id, starts_at, ends_at, capacity, recurrence_group_id, created_by
)
select
  'c0000000-0000-4000-8000-000000000001',
  ('f0000000-0000-4000-8000-' || lpad(g.program_no::text, 12, '0'))::uuid,
  ('b0000000-0000-4000-8000-' || lpad(g.instructor_no::text, 12, '0'))::uuid,
  ((w.monday + d.offset_days) + g.start_time) at time zone 'Asia/Seoul',
  ((w.monday + d.offset_days) + g.start_time + make_interval(mins => g.minutes)) at time zone 'Asia/Seoul',
  g.capacity,
  g.recurrence_group_id,
  'b0000000-0000-4000-8000-000000000001'
from grouped g
cross join week w
cross join generate_series(0, 13) as d(offset_days)
where extract(isodow from w.monday + d.offset_days)::int = any (g.dows);
