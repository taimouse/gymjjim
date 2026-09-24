-- ─────────────────────────────────────────────────────────────
-- 프로그램(수업 템플릿) · 사용 가능한 이용권 · 세션(캘린더의 1회 수업)
-- ─────────────────────────────────────────────────────────────

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  name text not null check (char_length(name) between 1 and 100),
  type public.program_type not null default 'group',
  default_capacity int not null default 10 check (default_capacity between 1 and 500),
  duration_min int not null default 60 check (duration_min between 5 and 600),
  color text not null default '#6366F1' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  description text check (char_length(description) <= 1000),
  default_instructor_id uuid,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint programs_id_center_uniq unique (id, center_id),
  constraint programs_instructor_fk foreign key (default_instructor_id, center_id)
    references public.staff (id, center_id)
);

create index programs_center_idx on public.programs (center_id, sort_order) where deleted_at is null;

create trigger programs_set_updated_at before update on public.programs
  for each row execute function private.set_updated_at();

-- 프로그램별로 예약에 쓸 수 있는 이용권 상품
create table public.program_allowed_products (
  center_id uuid not null references public.centers (id),
  program_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (program_id, product_id),
  constraint program_allowed_products_program_fk foreign key (program_id, center_id)
    references public.programs (id, center_id) on delete cascade,
  constraint program_allowed_products_product_fk foreign key (product_id, center_id)
    references public.pass_products (id, center_id) on delete cascade
);

create index program_allowed_products_product_idx on public.program_allowed_products (product_id);

-- 세션: 캘린더에 실제로 잡힌 1회 수업.
-- booked_count / waitlist_count 는 예약 RPC 안에서만 갱신한다 (세션 행 잠금 하에서).
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  program_id uuid not null,
  instructor_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int not null check (capacity between 1 and 500),
  status public.session_status not null default 'scheduled',
  booked_count int not null default 0 check (booked_count >= 0),
  waitlist_count int not null default 0 check (waitlist_count >= 0),
  recurrence_group_id uuid,
  note text check (char_length(note) <= 500),
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint sessions_id_center_uniq unique (id, center_id),
  constraint sessions_program_fk foreign key (program_id, center_id) references public.programs (id, center_id),
  constraint sessions_instructor_fk foreign key (instructor_id, center_id) references public.staff (id, center_id),
  constraint sessions_created_by_fk foreign key (created_by, center_id) references public.staff (id, center_id),
  constraint sessions_time_order check (ends_at > starts_at),
  constraint sessions_max_length check (ends_at - starts_at <= interval '12 hours')
);

create index sessions_center_starts_idx on public.sessions (center_id, starts_at) where deleted_at is null;
create index sessions_instructor_starts_idx on public.sessions (instructor_id, starts_at) where deleted_at is null;
create index sessions_recurrence_idx on public.sessions (recurrence_group_id, starts_at)
  where recurrence_group_id is not null;

create trigger sessions_set_updated_at before update on public.sessions
  for each row execute function private.set_updated_at();
