-- ─────────────────────────────────────────────────────────────
-- 센터 · 직원 · 회원
-- ─────────────────────────────────────────────────────────────

create table public.centers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  timezone text not null default 'Asia/Seoul',
  phone text check (phone ~ '^[0-9]{8,11}$'),
  address text check (char_length(address) <= 200),
  -- 예약 규칙 (CLAUDE.md 5번 기본값)
  booking_settings jsonb not null default jsonb_build_object(
    'open_days_before', 7,
    'close_minutes_before', 30,
    'free_cancel_hours_before', 3,
    'auto_promote_waitlist', true
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint centers_booking_settings_valid check (
    jsonb_typeof(booking_settings -> 'open_days_before') = 'number'
    and (booking_settings ->> 'open_days_before')::numeric between 0 and 90
    and jsonb_typeof(booking_settings -> 'close_minutes_before') = 'number'
    and (booking_settings ->> 'close_minutes_before')::numeric between 0 and 1440
    and jsonb_typeof(booking_settings -> 'free_cancel_hours_before') = 'number'
    and (booking_settings ->> 'free_cancel_hours_before')::numeric between 0 and 168
    and jsonb_typeof(booking_settings -> 'auto_promote_waitlist') = 'boolean'
  )
);

create trigger centers_set_updated_at before update on public.centers
  for each row execute function private.set_updated_at();
create trigger centers_valid_timezone before insert or update of timezone on public.centers
  for each row execute function private.assert_valid_timezone();

-- 대표(owner)·트레이너(staff). user_id 는 초대 수락 전에는 비어 있을 수 있다.
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  user_id uuid references auth.users (id) on delete set null,
  role public.staff_role not null default 'staff',
  name text not null check (char_length(name) between 1 and 50),
  email text check (email ~ '^[^@\s]+@[^@\s]+$'),
  phone text check (phone ~ '^[0-9]{9,11}$'),
  color text not null default '#6366F1' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint staff_id_center_uniq unique (id, center_id)
);

create unique index staff_center_user_uniq on public.staff (center_id, user_id)
  where user_id is not null and deleted_at is null;
create unique index staff_center_email_uniq on public.staff (center_id, lower(email))
  where email is not null and deleted_at is null;
create index staff_user_idx on public.staff (user_id) where deleted_at is null;

create trigger staff_set_updated_at before update on public.staff
  for each row execute function private.set_updated_at();

-- 회원. 전화번호는 숫자만 저장, 뒷 4자리 검색용 generated column
create table public.members (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(name) between 1 and 50),
  phone text check (phone ~ '^[0-9]{9,11}$'),
  phone_last4 text generated always as (right(phone, 4)) stored,
  birth date,
  gender public.gender,
  memo text check (char_length(memo) <= 2000),
  tags text[] not null default '{}',
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  -- 개인정보 수집·이용 동의(필수)와 마케팅 수신 동의(선택) 일시
  privacy_agreed_at timestamptz,
  marketing_agreed_at timestamptz,
  notify_enabled boolean not null default true,
  -- 회원 앱 첫 로그인 후 동의 화면을 마친 시각
  onboarded_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint members_id_center_uniq unique (id, center_id),
  constraint members_active_requires_phone check (status = 'withdrawn' or phone is not null),
  constraint members_active_requires_privacy check (status = 'withdrawn' or privacy_agreed_at is not null),
  constraint members_tags_limit check (cardinality(tags) <= 20)
);

create unique index members_center_phone_uniq on public.members (center_id, phone)
  where phone is not null and deleted_at is null;
create index members_center_last4_idx on public.members (center_id, phone_last4)
  where deleted_at is null;
create index members_center_name_idx on public.members (center_id, name)
  where deleted_at is null;
create unique index members_center_user_uniq on public.members (center_id, user_id)
  where user_id is not null and deleted_at is null;
create index members_user_idx on public.members (user_id) where deleted_at is null;

create trigger members_set_updated_at before update on public.members
  for each row execute function private.set_updated_at();
