-- ─────────────────────────────────────────────────────────────
-- 예약 · 회원 초대 · 알림 발송 기록
-- ─────────────────────────────────────────────────────────────

-- 예약. 삭제하지 않고 상태로만 이력을 남긴다. 쓰기는 RPC(예약 엔진)에서만 한다.
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  session_id uuid not null,
  member_id uuid not null,
  member_pass_id uuid,
  status public.booking_status not null,
  waitlist_position int check (waitlist_position > 0),
  -- 이 예약으로 이용권 횟수를 1회 차감했는지 (무료 취소·폐강 시 정확히 복구하기 위함)
  pass_deducted boolean not null default false,
  booked_by public.booked_by not null default 'member',
  booked_by_staff_id uuid,
  cancelled_at timestamptz,
  -- member | staff | session_cancelled | promotion_failed
  cancel_reason text,
  attended_at timestamptz,
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_session_fk foreign key (session_id, center_id) references public.sessions (id, center_id),
  constraint bookings_member_fk foreign key (member_id, center_id) references public.members (id, center_id),
  constraint bookings_pass_center_fk foreign key (member_pass_id, center_id)
    references public.member_passes (id, center_id),
  constraint bookings_pass_member_fk foreign key (member_pass_id, member_id)
    references public.member_passes (id, member_id),
  constraint bookings_staff_fk foreign key (booked_by_staff_id, center_id) references public.staff (id, center_id),
  constraint bookings_waitlist_position check ((status = 'waitlisted') = (waitlist_position is not null)),
  constraint bookings_deducted_requires_pass check (not pass_deducted or member_pass_id is not null)
);

-- 같은 수업에 살아 있는 예약은 회원당 1개
create unique index bookings_active_uniq on public.bookings (session_id, member_id)
  where status in ('booked', 'waitlisted', 'attended', 'no_show');
create index bookings_session_status_idx on public.bookings (session_id, status);
create index bookings_member_created_idx on public.bookings (member_id, created_at desc);
create index bookings_pass_idx on public.bookings (member_pass_id) where member_pass_id is not null;
create index bookings_center_created_idx on public.bookings (center_id, created_at desc);

create trigger bookings_set_updated_at before update on public.bookings
  for each row execute function private.set_updated_at();

-- 회원 초대 링크(1회용). 원문 토큰은 링크에만 담고 DB에는 SHA-256 해시만 저장한다.
create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  member_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint member_invites_member_fk foreign key (member_id, center_id) references public.members (id, center_id),
  constraint member_invites_created_by_fk foreign key (created_by, center_id) references public.staff (id, center_id)
);

create index member_invites_member_idx on public.member_invites (member_id, created_at desc);

-- 알림 발송 기록이자 발송 대기열(아웃박스). RPC가 pending 으로 넣고 Edge Function이 발송한다.
create table public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  member_id uuid,
  type text not null,
  channel public.notification_channel not null default 'alimtalk',
  template_code text not null,
  payload jsonb not null default '{}',
  status public.notification_status not null default 'pending',
  fallback_used boolean not null default false,
  -- 같은 알림을 두 번 보내지 않기 위한 키 (예: reminder_2h:<booking_id>)
  dedupe_key text,
  error text,
  attempts int not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_logs_member_fk foreign key (member_id, center_id) references public.members (id, center_id)
);

create unique index notification_logs_dedupe_uniq on public.notification_logs (dedupe_key)
  where dedupe_key is not null;
create index notification_logs_pending_idx on public.notification_logs (scheduled_at)
  where status = 'pending';
create index notification_logs_center_created_idx on public.notification_logs (center_id, created_at desc);
