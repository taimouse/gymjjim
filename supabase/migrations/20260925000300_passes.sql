-- ─────────────────────────────────────────────────────────────
-- 이용권: 판매 상품 · 회원 보유 이용권 · 정지(홀딩)
-- ─────────────────────────────────────────────────────────────

-- 판매용 이용권 상품: 기간권(period) / 횟수권(count, 무기한) / 기간+횟수(period_count)
create table public.pass_products (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  name text not null check (char_length(name) between 1 and 100),
  type public.pass_type not null,
  duration_days int check (duration_days between 1 and 3650),
  total_count int check (total_count between 1 and 1000),
  -- 기간 내 이용 횟수 제한 (예: 주 3회)
  period_limit_count int check (period_limit_count between 1 and 100),
  period_limit_unit public.period_unit,
  price int not null default 0 check (price between 0 and 100000000),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint pass_products_id_center_uniq unique (id, center_id),
  constraint pass_products_type_fields check (
    (type = 'period' and duration_days is not null and total_count is null)
    or (type = 'count' and duration_days is null and total_count is not null)
    or (type = 'period_count' and duration_days is not null and total_count is not null)
  ),
  constraint pass_products_limit_pair check ((period_limit_count is null) = (period_limit_unit is null))
);

create index pass_products_center_idx on public.pass_products (center_id, sort_order) where deleted_at is null;

create trigger pass_products_set_updated_at before update on public.pass_products
  for each row execute function private.set_updated_at();

-- 회원이 보유한 이용권. 판매 이후 상품이 바뀌어도 영향이 없도록 이름·유형·제한을 스냅샷으로 저장한다.
create table public.member_passes (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  member_id uuid not null,
  product_id uuid,
  name text not null check (char_length(name) between 1 and 100),
  type public.pass_type not null,
  start_date date not null,
  -- count(무기한 횟수권)은 null
  end_date date,
  -- period(기간권)은 null = 횟수 무제한
  total_count int check (total_count between 0 and 1000),
  remaining_count int check (remaining_count >= 0),
  period_limit_count int check (period_limit_count between 1 and 100),
  period_limit_unit public.period_unit,
  -- active: 사용 중 / cancelled: 환불·취소 (만료·소진·정지는 날짜와 횟수로 계산)
  status public.pass_status not null default 'active',
  paid_amount int not null default 0 check (paid_amount between 0 and 100000000),
  paid_at timestamptz,
  memo text check (char_length(memo) <= 1000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint member_passes_id_center_uniq unique (id, center_id),
  constraint member_passes_id_member_uniq unique (id, member_id),
  constraint member_passes_member_fk foreign key (member_id, center_id) references public.members (id, center_id),
  constraint member_passes_product_fk foreign key (product_id, center_id)
    references public.pass_products (id, center_id),
  constraint member_passes_created_by_fk foreign key (created_by, center_id) references public.staff (id, center_id),
  constraint member_passes_dates check (end_date is null or end_date >= start_date),
  constraint member_passes_end_date_required check (type = 'count' or end_date is not null),
  constraint member_passes_counts check (
    (type = 'period' and total_count is null and remaining_count is null)
    or (type <> 'period' and total_count is not null and remaining_count is not null
        and remaining_count <= total_count)
  ),
  constraint member_passes_limit_pair check ((period_limit_count is null) = (period_limit_unit is null))
);

create index member_passes_member_idx on public.member_passes (member_id) where deleted_at is null;
create index member_passes_center_end_idx on public.member_passes (center_id, end_date)
  where deleted_at is null and status = 'active';

create trigger member_passes_set_updated_at before update on public.member_passes
  for each row execute function private.set_updated_at();

-- 이용권 정지(홀딩) 기간. 같은 이용권의 정지 기간은 겹칠 수 없다.
create table public.pass_holds (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  member_pass_id uuid not null,
  start_date date not null,
  end_date date not null,
  reason text check (char_length(reason) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint pass_holds_pass_fk foreign key (member_pass_id, center_id)
    references public.member_passes (id, center_id),
  constraint pass_holds_created_by_fk foreign key (created_by, center_id) references public.staff (id, center_id),
  constraint pass_holds_dates check (end_date >= start_date),
  constraint pass_holds_no_overlap exclude using gist (
    member_pass_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

create index pass_holds_pass_idx on public.pass_holds (member_pass_id);
