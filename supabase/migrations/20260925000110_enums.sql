-- ─────────────────────────────────────────────────────────────
-- 열거형. 생성되는 TypeScript 타입이 문자열 유니온이 되도록 enum 으로 정의한다.
-- ─────────────────────────────────────────────────────────────

create type public.staff_role as enum ('owner', 'staff');
create type public.member_status as enum ('active', 'withdrawn');
create type public.gender as enum ('male', 'female', 'other');

-- 기간권 / 횟수권(무기한) / 기간+횟수
create type public.pass_type as enum ('period', 'count', 'period_count');
create type public.period_unit as enum ('week', 'month');
-- active: 사용 중, cancelled: 환불·취소 (만료·소진·정지는 날짜·횟수로 계산)
create type public.pass_status as enum ('active', 'cancelled');

create type public.program_type as enum ('group', 'private');
create type public.session_status as enum ('scheduled', 'cancelled');

create type public.booking_status as enum (
  'booked', 'waitlisted', 'cancelled', 'late_cancelled', 'attended', 'no_show'
);
create type public.booked_by as enum ('member', 'staff');

create type public.notification_channel as enum ('alimtalk', 'sms', 'webpush');
create type public.notification_status as enum ('pending', 'sending', 'sent', 'failed', 'skipped');
