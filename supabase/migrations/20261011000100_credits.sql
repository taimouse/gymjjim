-- ─────────────────────────────────────────────────────────────
-- 크레딧: 회원 지갑(화폐 같은 개념)
-- 이용권(기간권·횟수권)과 별개다. 회원은 크레딧을 충전해 두고, 크레딧을 받는 프로그램을 예약할 때
-- 프로그램마다 정한 만큼(programs.credit_cost) 쓴다.
--   - 크레딧 1개 가격: centers.credit_price (기본 5,000원, 설정에서 변경)
--   - 프로그램: 이용권(program_allowed_products) / 크레딧(credit_cost) 중 하나 또는 둘 다 받는다
--   - 예약: 쓸 수 있는 이용권이 있으면 이용권(횟수권은 1회 차감), 없으면 크레딧
--   - 무료 취소·폐강은 크레딧을 돌려주고, 늦은 취소·노쇼는 그대로 둔다 (이용권과 같은 규칙)
--   - 충전: 결제 연동 전이라 회원이 충전 요청 → 직원이 입금 확인 후 승인. 직원이 직접 충전·차감도 한다
--   - 잔액이 바뀔 때마다 credit_transactions 원장에 남긴다
-- ─────────────────────────────────────────────────────────────

alter table public.centers
  add column credit_price int not null default 5000 check (credit_price between 0 and 1000000);
comment on column public.centers.credit_price is '크레딧 1개 가격(원)';
grant update (credit_price) on public.centers to authenticated;

alter table public.members
  add column credit_balance int not null default 0 check (credit_balance >= 0);
comment on column public.members.credit_balance is '보유 크레딧. RPC(private.add_credits)로만 바꾼다';

alter table public.programs
  add column credit_cost int check (credit_cost between 1 and 100);
comment on column public.programs.credit_cost is '크레딧으로 예약할 때 쓰는 크레딧 (null = 크레딧으로 예약 불가)';

alter table public.bookings
  add column credits_used int not null default 0 check (credits_used >= 0);
comment on column public.bookings.credits_used is '이 예약으로 쓴 크레딧 (무료 취소·폐강 때 그만큼 돌려준다)';
alter table public.bookings
  add constraint bookings_credit_or_pass check (credits_used = 0 or (member_pass_id is null and not pass_deducted));

create type public.credit_reason as enum ('charge', 'booking', 'refund', 'adjust');
create type public.credit_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- 크레딧 충전 요청 (회원 → 직원 승인)
create table public.credit_requests (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  member_id uuid not null,
  amount int not null check (amount between 1 and 1000),
  -- 요청 시점의 크레딧 1개 가격 (가격이 바뀌어도 요청 금액은 그대로)
  unit_price int not null check (unit_price >= 0),
  status public.credit_request_status not null default 'pending',
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_requests_member_fk foreign key (member_id, center_id) references public.members (id, center_id),
  constraint credit_requests_staff_fk foreign key (decided_by, center_id) references public.staff (id, center_id)
);
create index credit_requests_pending_idx on public.credit_requests (center_id, created_at) where status = 'pending';
create index credit_requests_member_idx on public.credit_requests (member_id, created_at desc);
create trigger credit_requests_set_updated_at before update on public.credit_requests
  for each row execute function private.set_updated_at();

-- 크레딧 원장: 충전·사용·환불·조정
create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references public.centers (id),
  member_id uuid not null,
  delta int not null check (delta <> 0),
  balance_after int not null check (balance_after >= 0),
  reason public.credit_reason not null,
  booking_id uuid references public.bookings (id),
  request_id uuid references public.credit_requests (id),
  memo text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint credit_transactions_member_fk foreign key (member_id, center_id)
    references public.members (id, center_id),
  constraint credit_transactions_staff_fk foreign key (created_by, center_id) references public.staff (id, center_id)
);
create index credit_transactions_member_idx on public.credit_transactions (member_id, created_at desc);

-- 직원·본인 조회만. 쓰기는 RPC
alter table public.credit_requests enable row level security;
alter table public.credit_transactions enable row level security;
revoke all on table public.credit_requests, public.credit_transactions from anon, authenticated;
grant all on table public.credit_requests, public.credit_transactions to service_role;
grant select on public.credit_requests, public.credit_transactions to authenticated;
create policy credit_requests_select on public.credit_requests for select to authenticated
  using (center_id in (select private.staff_center_ids()) or member_id in (select private.member_ids()));
create policy credit_transactions_select on public.credit_transactions for select to authenticated
  using (center_id in (select private.staff_center_ids()) or member_id in (select private.member_ids()));

-- 잔액을 p_delta 만큼 바꾸고 원장에 남긴다. 모자라면 CREDIT_INSUFFICIENT. 바뀐 잔액을 돌려준다
create or replace function private.add_credits(
  p_member_id uuid,
  p_delta int,
  p_reason public.credit_reason,
  p_booking_id uuid default null,
  p_request_id uuid default null,
  p_memo text default null,
  p_staff_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
begin
  select * into v_member from public.members where id = p_member_id for update;
  if not found then
    perform private.raise_app_error('MEMBER_NOT_FOUND');
  end if;
  if v_member.credit_balance + p_delta < 0 then
    perform private.raise_app_error('CREDIT_INSUFFICIENT');
  end if;
  update public.members set credit_balance = credit_balance + p_delta where id = p_member_id;
  insert into public.credit_transactions (
    center_id, member_id, delta, balance_after, reason, booking_id, request_id, memo, created_by
  ) values (
    v_member.center_id, p_member_id, p_delta, v_member.credit_balance + p_delta, p_reason, p_booking_id,
    p_request_id, nullif(trim(p_memo), ''), p_staff_id
  );
  return v_member.credit_balance + p_delta;
end;
$$;
revoke all on function private.add_credits(uuid, int, public.credit_reason, uuid, uuid, text, uuid) from public;

-- 프로그램의 크레딧 가격 (null = 크레딧으로 예약할 수 없다)
create or replace function private.program_credit_cost(p_program_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select p.credit_cost from public.programs p where p.id = p_program_id;
$$;
revoke all on function private.program_credit_cost(uuid) from public;

-- 쓸 수 있는 이용권이 없을 때 크레딧으로 낼 수 있는지. 낼 수 있으면 null, 아니면 보여줄 에러 코드
create or replace function private.credit_error(p_member_id uuid, p_cost int, p_pass_error text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_cost is null then coalesce(p_pass_error, 'NO_VALID_PASS')
    when coalesce((select m.credit_balance from public.members m where m.id = p_member_id), 0) >= p_cost then null
    -- 이용권 문제(만료·정지 등)를 더 구체적으로 알려줄 수 있으면 그것을, 아니면 크레딧 부족
    when p_pass_error is null or p_pass_error = 'NO_VALID_PASS' then 'CREDIT_INSUFFICIENT'
    else p_pass_error
  end;
$$;
revoke all on function private.credit_error(uuid, int, text) from public;


create or replace function private.create_booking(
  p_session_id uuid,
  p_member_id uuid,
  p_member_pass_id uuid,
  p_booked_by public.booked_by,
  p_staff_id uuid,
  p_check_window boolean,
  p_allow_over_capacity boolean,
  p_waitlist_if_full boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_rules private.center_rules;
  v_local_date date;
  v_pass_id uuid;
  v_pass public.member_passes;
  v_error text;
  v_status public.booking_status;
  v_position int;
  v_deducted boolean := false;
  v_credit_cost int;
  v_use_credit boolean := false;
  v_credits int := 0;
  v_balance int;
  v_booking_id uuid;
begin
  -- 같은 회원의 동시 예약을 한 줄로 세운다 (시간 겹침 검사가 경쟁 상태에 빠지지 않도록)
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gymjjim:member:' || p_member_id::text, 0));

  select * into v_session
  from public.sessions
  where id = p_session_id and deleted_at is null
  for update;
  if not found then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;
  if v_session.status = 'cancelled' then
    perform private.raise_app_error('SESSION_CANCELLED');
  end if;

  v_rules := private.center_rules(v_session.center_id);
  v_local_date := (v_session.starts_at at time zone v_rules.timezone)::date;

  if p_check_window then
    if now() >= v_session.starts_at - make_interval(mins => v_rules.close_minutes_before) then
      perform private.raise_app_error('BOOKING_CLOSED');
    end if;
    -- 예약 오픈: 오늘(센터 시간대)부터 open_days_before 일 뒤 날짜의 수업까지
    if v_local_date > (now() at time zone v_rules.timezone)::date + v_rules.open_days_before then
      perform private.raise_app_error('BOOKING_NOT_OPEN');
    end if;
  end if;

  if exists (
    select 1 from public.bookings b
    where b.session_id = p_session_id and b.member_id = p_member_id
      and b.status in ('booked', 'waitlisted', 'attended', 'no_show')
  ) then
    perform private.raise_app_error('ALREADY_BOOKED');
  end if;

  if exists (
    select 1
    from public.bookings b
    join public.sessions o on o.id = b.session_id
    where b.member_id = p_member_id
      and b.status in ('booked', 'waitlisted', 'attended', 'no_show')
      and o.id <> p_session_id
      and o.status = 'scheduled'
      and o.deleted_at is null
      and o.starts_at < v_session.ends_at
      and o.ends_at > v_session.starts_at
  ) then
    perform private.raise_app_error('DUPLICATE_TIME');
  end if;

  -- 이용권: 지정했으면 그것, 아니면 만료 임박 순 자동 선택. 쓸 수 있는 이용권이 없으면 크레딧
  v_credit_cost := private.program_credit_cost(v_session.program_id);
  if p_member_pass_id is not null then
    v_pass_id := p_member_pass_id;
  else
    select pp.pass_id, pp.error_code into v_pass_id, v_error
    from private.pick_pass(p_member_id, v_session, v_local_date, v_rules.timezone) pp;
    if v_pass_id is null then
      v_error := private.credit_error(p_member_id, v_credit_cost, v_error);
      if v_error is not null then
        perform private.raise_app_error(v_error);
      end if;
      v_use_credit := true;
    end if;
  end if;

  if not v_use_credit then
    -- 잠근 뒤 다시 검사한다
    select * into v_pass
    from public.member_passes
    where id = v_pass_id and member_id = p_member_id and center_id = v_session.center_id
    for update;
    if not found then
      perform private.raise_app_error('PASS_NOT_FOUND');
    end if;
    v_error := private.pass_error(v_pass, v_session, v_local_date, v_rules.timezone);
    if v_error is not null then
      perform private.raise_app_error(v_error);
    end if;
  end if;

  -- 정원
  if v_session.booked_count < v_session.capacity or p_allow_over_capacity then
    v_status := 'booked';
  elsif p_waitlist_if_full then
    v_status := 'waitlisted';
  else
    perform private.raise_app_error('SESSION_FULL');
  end if;

  if v_status = 'booked' then
    if v_use_credit then
      v_credits := v_credit_cost;
    else
      v_deducted := private.deduct_pass(v_pass.id);
    end if;
    update public.sessions set booked_count = booked_count + 1 where id = p_session_id;
  else
    -- 대기는 승격될 때 차감한다
    select coalesce(max(b.waitlist_position), 0) + 1 into v_position
    from public.bookings b
    where b.session_id = p_session_id and b.status = 'waitlisted';
    update public.sessions set waitlist_count = waitlist_count + 1 where id = p_session_id;
  end if;

  insert into public.bookings (
    center_id, session_id, member_id, member_pass_id, status, waitlist_position,
    pass_deducted, credits_used, booked_by, booked_by_staff_id
  ) values (
    v_session.center_id, p_session_id, p_member_id, case when v_use_credit then null else v_pass.id end, v_status,
    v_position, v_deducted, v_credits, p_booked_by, p_staff_id
  )
  returning id into v_booking_id;

  if v_credits > 0 then
    v_balance := private.add_credits(p_member_id, -v_credits, 'booking', v_booking_id, null, null, p_staff_id);
  end if;

  if v_status = 'booked' then
    perform private.enqueue_notification(
      v_session.center_id, p_member_id, 'booking_confirmed',
      private.session_payload(p_session_id) || jsonb_build_object('booking_id', v_booking_id),
      'booking_confirmed:' || v_booking_id
    );
  end if;

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'status', v_status,
    'waitlist_position', v_position,
    'member_pass_id', case when v_use_credit then null else v_pass.id end,
    'remaining_count', case when v_use_credit then null
      else (select mp.remaining_count from public.member_passes mp where mp.id = v_pass.id) end,
    'credits_used', v_credits,
    'credit_balance', coalesce(v_balance, (select m.credit_balance from public.members m where m.id = p_member_id))
  );
end;
$$;

create or replace function private.promote_waitlist(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_rules private.center_rules;
  v_local_date date;
  v_next public.bookings;
  v_pass public.member_passes;
  v_pass_id uuid;
  v_credit_cost int;
  v_deducted boolean;
  v_promoted jsonb := '[]'::jsonb;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' or v_session.deleted_at is not null then
    return v_promoted;
  end if;

  v_rules := private.center_rules(v_session.center_id);
  if now() >= v_session.starts_at - make_interval(mins => v_rules.close_minutes_before) then
    return v_promoted;
  end if;
  v_local_date := (v_session.starts_at at time zone v_rules.timezone)::date;
  v_credit_cost := private.program_credit_cost(v_session.program_id);

  loop
    exit when v_session.booked_count >= v_session.capacity;

    select * into v_next
    from public.bookings
    where session_id = p_session_id and status = 'waitlisted'
    order by waitlist_position
    limit 1
    for update;
    exit when not found;

    v_pass_id := null;
    if v_next.member_pass_id is not null then
      select * into v_pass from public.member_passes where id = v_next.member_pass_id for update;
      if private.pass_error(v_pass, v_session, v_local_date, v_rules.timezone, v_next.id) is null then
        v_pass_id := v_pass.id;
      end if;
    end if;
    if v_pass_id is null then
      select pp.pass_id into v_pass_id
      from private.pick_pass(v_next.member_id, v_session, v_local_date, v_rules.timezone, v_next.id) pp;
      if v_pass_id is not null then
        select * into v_pass from public.member_passes where id = v_pass_id for update;
        if private.pass_error(v_pass, v_session, v_local_date, v_rules.timezone, v_next.id) is not null then
          v_pass_id := null;
        end if;
      end if;
    end if;

    -- 대기열에서 빼고 뒤 순번을 한 칸씩 당긴다
    update public.bookings
    set waitlist_position = waitlist_position - 1
    where session_id = p_session_id and status = 'waitlisted' and waitlist_position > v_next.waitlist_position;
    v_session.waitlist_count := v_session.waitlist_count - 1;

    if v_pass_id is not null then
      v_deducted := private.deduct_pass(v_pass_id);
      update public.bookings
      set status = 'booked', waitlist_position = null, member_pass_id = v_pass_id, pass_deducted = v_deducted,
          credits_used = 0, promoted_at = now()
      where id = v_next.id;
    elsif private.credit_error(v_next.member_id, v_credit_cost, null) is null then
      -- 이용권이 없으면 크레딧으로
      update public.bookings
      set status = 'booked', waitlist_position = null, member_pass_id = null, pass_deducted = false,
          credits_used = v_credit_cost, promoted_at = now()
      where id = v_next.id;
      perform private.add_credits(v_next.member_id, -v_credit_cost, 'booking', v_next.id);
    else
      update public.bookings
      set status = 'cancelled', waitlist_position = null, cancelled_at = now(), cancel_reason = 'promotion_failed'
      where id = v_next.id;
      continue;
    end if;
    v_session.booked_count := v_session.booked_count + 1;

    perform private.enqueue_notification(
      v_session.center_id, v_next.member_id, 'waitlist_promoted',
      private.session_payload(p_session_id) || jsonb_build_object('booking_id', v_next.id),
      'waitlist_promoted:' || v_next.id
    );
    v_promoted := v_promoted || jsonb_build_array(v_next.id);
  end loop;

  update public.sessions
  set booked_count = v_session.booked_count, waitlist_count = v_session.waitlist_count
  where id = p_session_id;
  return v_promoted;
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid, p_waive_penalty boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
  v_session public.sessions;
  v_rules private.center_rules;
  v_is_staff boolean;
  v_is_member boolean;
  v_reason text;
  v_new_status public.booking_status;
  v_restored boolean := false;
  v_promoted jsonb := '[]'::jsonb;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    perform private.raise_app_error('BOOKING_NOT_FOUND');
  end if;

  v_is_staff := private.is_staff(v_booking.center_id);
  v_is_member := v_booking.member_id in (select private.member_ids());
  if not v_is_staff and not v_is_member then
    perform private.raise_app_error('BOOKING_NOT_FOUND');
  end if;
  if p_waive_penalty and not v_is_staff then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  v_reason := case when v_is_member then 'member' else 'staff' end;

  select * into v_session from public.sessions where id = v_booking.session_id for update;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.status not in ('booked', 'waitlisted') then
    perform private.raise_app_error('BOOKING_NOT_CANCELLABLE');
  end if;
  if not v_is_staff and now() >= v_session.starts_at then
    perform private.raise_app_error('SESSION_STARTED');
  end if;

  v_rules := private.center_rules(v_booking.center_id);

  if v_booking.status = 'waitlisted' then
    update public.bookings
    set status = 'cancelled', waitlist_position = null, cancelled_at = now(), cancel_reason = v_reason
    where id = p_booking_id;
    update public.bookings
    set waitlist_position = waitlist_position - 1
    where session_id = v_session.id and status = 'waitlisted' and waitlist_position > v_booking.waitlist_position;
    update public.sessions set waitlist_count = waitlist_count - 1 where id = v_session.id;
    return jsonb_build_object('booking_id', p_booking_id, 'status', 'cancelled', 'restored', false,
      'promoted', v_promoted);
  end if;

  if p_waive_penalty
     or now() <= v_session.starts_at
       - make_interval(secs => (v_rules.free_cancel_hours_before * 3600)::double precision) then
    v_new_status := 'cancelled';
    if v_booking.pass_deducted then
      perform private.restore_pass(v_booking.member_pass_id);
      v_restored := true;
    end if;
    if v_booking.credits_used > 0 then
      perform private.add_credits(v_booking.member_id, v_booking.credits_used, 'refund', p_booking_id);
      v_restored := true;
    end if;
  else
    v_new_status := 'late_cancelled';
  end if;

  update public.bookings
  set status = v_new_status, cancelled_at = now(), cancel_reason = v_reason,
      pass_deducted = case when v_restored then false else pass_deducted end,
      credits_used = case when v_restored then 0 else credits_used end
  where id = p_booking_id;
  update public.sessions set booked_count = booked_count - 1 where id = v_session.id;

  if v_rules.auto_promote_waitlist then
    v_promoted := private.promote_waitlist(v_session.id);
  end if;

  return jsonb_build_object('booking_id', p_booking_id, 'status', v_new_status, 'restored', v_restored,
    'promoted', v_promoted);
end;
$$;

create or replace function public.cancel_session(p_session_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_booking record;
  v_payload jsonb;
  v_affected jsonb := '[]'::jsonb;
  v_restored int := 0;
begin
  select * into v_session from public.sessions where id = p_session_id and deleted_at is null for update;
  if not found then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;
  if not private.is_staff(v_session.center_id) then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  if v_session.status = 'cancelled' then
    perform private.raise_app_error('SESSION_CANCELLED');
  end if;
  if now() >= v_session.ends_at then
    perform private.raise_app_error('SESSION_ENDED');
  end if;

  v_payload := private.session_payload(p_session_id) || jsonb_build_object('reason', p_reason);

  for v_booking in
    select b.id, b.member_id, b.member_pass_id, b.status, b.pass_deducted, b.credits_used,
      m.name as member_name
    from public.bookings b
    join public.members m on m.id = b.member_id
    where b.session_id = p_session_id and b.status in ('booked', 'waitlisted')
    order by b.member_pass_id, b.id
    for update of b
  loop
    if v_booking.pass_deducted then
      perform private.restore_pass(v_booking.member_pass_id);
      v_restored := v_restored + 1;
    end if;
    if v_booking.credits_used > 0 then
      perform private.add_credits(v_booking.member_id, v_booking.credits_used, 'refund', v_booking.id);
      v_restored := v_restored + 1;
    end if;
    update public.bookings
    set status = 'cancelled', waitlist_position = null, pass_deducted = false, credits_used = 0,
        cancelled_at = now(), cancel_reason = 'session_cancelled'
    where id = v_booking.id;

    perform private.enqueue_notification(
      v_session.center_id, v_booking.member_id, 'session_cancelled',
      v_payload || jsonb_build_object('booking_id', v_booking.id),
      'session_cancelled:' || v_booking.id,
      true
    );
    v_affected := v_affected || jsonb_build_object(
      'booking_id', v_booking.id,
      'member_id', v_booking.member_id,
      'member_name', v_booking.member_name,
      'previous_status', v_booking.status
    );
  end loop;

  update public.sessions
  set status = 'cancelled',
      cancelled_at = now(),
      cancel_reason = p_reason,
      waitlist_count = 0,
      booked_count = (
        select count(*) from public.bookings b
        where b.session_id = p_session_id and b.status in ('booked', 'attended', 'no_show')
      )
  where id = p_session_id;

  return jsonb_build_object('session_id', p_session_id, 'affected', v_affected, 'restored_count', v_restored);
end;
$$;

-- 예약 미리보기: 쓸 이용권, 또는 크레딧으로 낼 때의 가격·잔액
create or replace function public.preview_booking(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_rules private.center_rules;
  v_member_id uuid;
  v_pass_id uuid;
  v_error text;
  v_pass public.member_passes;
  v_cost int;
begin
  select * into v_session from public.sessions where id = p_session_id and deleted_at is null;
  if not found or not private.is_published(v_session.publish_at, v_session.program_id) then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;
  v_member_id := private.my_member_id(v_session.center_id);
  v_rules := private.center_rules(v_session.center_id);
  v_cost := private.program_credit_cost(v_session.program_id);
  select pp.pass_id, pp.error_code into v_pass_id, v_error
  from private.pick_pass(v_member_id, v_session, (v_session.starts_at at time zone v_rules.timezone)::date,
    v_rules.timezone) pp;
  if v_pass_id is not null then
    select * into v_pass from public.member_passes where id = v_pass_id;
  else
    v_error := private.credit_error(v_member_id, v_cost, v_error);
  end if;
  return jsonb_build_object(
    'method', case when v_pass_id is not null then 'pass' when v_error is null then 'credit' end,
    'pass', case when v_pass_id is null then null else jsonb_build_object(
      'id', v_pass.id, 'name', v_pass.name, 'type', v_pass.type,
      'remaining_count', v_pass.remaining_count, 'end_date', v_pass.end_date) end,
    'error', v_error,
    'credit', case when v_cost is null then null else jsonb_build_object(
      'cost', v_cost,
      'balance', coalesce((select m.credit_balance from public.members m where m.id = v_member_id), 0)) end,
    'free_cancel_until', v_session.starts_at
      - make_interval(secs => (v_rules.free_cancel_hours_before * 3600)::double precision),
    'close_at', v_session.starts_at - make_interval(mins => v_rules.close_minutes_before)
  );
end;
$$;

-- 프로그램 저장: 크레딧 가격(p_credit_cost, null = 크레딧 안 받음) 추가
drop function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text, timestamptz);

create function public.save_program(
  p_center_id uuid,
  p_name text,
  p_type public.program_type,
  p_default_capacity int,
  p_duration_min int,
  p_color text,
  p_allowed_product_ids uuid[],
  p_id uuid default null,
  p_default_instructor_id uuid default null,
  p_description text default null,
  p_publish_at timestamptz default null,
  p_credit_cost int default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into public.programs (
      center_id, name, type, default_capacity, duration_min, color, default_instructor_id, description,
      publish_at, credit_cost, sort_order
    )
    values (
      p_center_id, p_name, p_type, p_default_capacity, p_duration_min, p_color, p_default_instructor_id,
      nullif(trim(p_description), ''), p_publish_at, p_credit_cost,
      coalesce((select max(p.sort_order) + 1 from public.programs p where p.center_id = p_center_id), 0)
    )
    returning id into v_id;
  else
    update public.programs
    set name = p_name,
        type = p_type,
        default_capacity = p_default_capacity,
        duration_min = p_duration_min,
        color = p_color,
        default_instructor_id = p_default_instructor_id,
        description = nullif(trim(p_description), ''),
        publish_at = p_publish_at,
        credit_cost = p_credit_cost
    where id = p_id and center_id = p_center_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      perform private.raise_app_error('FORBIDDEN');
    end if;
  end if;

  delete from public.program_allowed_products
  where program_id = v_id and not (product_id = any (coalesce(p_allowed_product_ids, '{}')));

  insert into public.program_allowed_products (center_id, program_id, product_id)
  select p_center_id, v_id, product_id
  from unnest(coalesce(p_allowed_product_ids, '{}')) as product_id
  on conflict (program_id, product_id) do nothing;

  return v_id;
end;
$$;

revoke all on function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text,
  timestamptz, int)
  from public, anon;
grant execute on function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text,
  timestamptz, int)
  to authenticated;


-- 회원 시간표: 수업 카드에 크레딧 가격을, 내 예약이 크레딧으로 낸 것인지를 함께 돌려준다 (반환 모양이 바뀌어 다시 만든다)
drop function public.member_schedule(uuid, date, date);

create function public.member_schedule(p_center_id uuid, p_from date, p_to date)
returns table (
  session_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  program_id uuid,
  program_name text,
  program_color text,
  instructor_name text,
  capacity int,
  booked_count int,
  waitlist_count int,
  my_booking_id uuid,
  my_status public.booking_status,
  my_waitlist_position int,
  my_pass_type public.pass_type,
  my_credits_used int,
  credit_cost int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.my_member_id(p_center_id);
  v_timezone text := (private.center_rules(p_center_id)).timezone;
begin
  if p_to - p_from > 31 then
    perform private.raise_app_error('VALIDATION');
  end if;
  return query
  select s.id, s.starts_at, s.ends_at, p.id, p.name, p.color, st.name,
         s.capacity, s.booked_count, s.waitlist_count, b.id, b.status, b.waitlist_position, mp.type,
         b.credits_used, p.credit_cost
  from public.sessions s
  join public.programs p on p.id = s.program_id
  left join public.staff st on st.id = s.instructor_id
  left join public.bookings b
    on b.session_id = s.id and b.member_id = v_member_id
   and b.status in ('booked', 'waitlisted', 'attended', 'no_show')
  left join public.member_passes mp on mp.id = b.member_pass_id
  where s.center_id = p_center_id
    and s.deleted_at is null
    and s.status = 'scheduled'
    and coalesce(s.publish_at, '-infinity'::timestamptz) <= now()
    and coalesce(p.publish_at, '-infinity'::timestamptz) <= now()
    and (s.starts_at at time zone v_timezone)::date between p_from and p_to
  order by s.starts_at, p.name;
end;
$$;

revoke all on function public.member_schedule(uuid, date, date) from public, anon;
grant execute on function public.member_schedule(uuid, date, date) to authenticated;

-- 내 예약: 크레딧으로 낸 예약인지 함께 돌려준다
drop function public.member_bookings(uuid, boolean, int);

create function public.member_bookings(p_center_id uuid, p_upcoming boolean, p_limit int default 50)
returns table (
  booking_id uuid,
  status public.booking_status,
  waitlist_position int,
  session_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  session_status public.session_status,
  cancel_reason text,
  program_name text,
  program_color text,
  instructor_name text,
  pass_name text,
  pass_type public.pass_type,
  credits_used int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.my_member_id(p_center_id);
begin
  return query
  select b.id, b.status, b.waitlist_position, s.id, s.starts_at, s.ends_at, s.status, s.cancel_reason,
         p.name, p.color, st.name, mp.name, mp.type, b.credits_used
  from public.bookings b
  join public.sessions s on s.id = b.session_id
  join public.programs p on p.id = s.program_id
  left join public.staff st on st.id = s.instructor_id
  left join public.member_passes mp on mp.id = b.member_pass_id
  where b.member_id = v_member_id
    and case when p_upcoming
      then b.status in ('booked', 'waitlisted') and s.ends_at > now()
      else not (b.status in ('booked', 'waitlisted') and s.ends_at > now())
    end
  order by
    case when p_upcoming then s.starts_at end asc,
    case when not p_upcoming then s.starts_at end desc
  limit least(greatest(p_limit, 1), 200);
end;
$$;

revoke all on function public.member_bookings(uuid, boolean, int) from public, anon;
grant execute on function public.member_bookings(uuid, boolean, int) to authenticated;


-- ───────────── 크레딧 지갑 RPC ─────────────

-- 내 크레딧 (회원): 잔액 · 1개 가격 · 대기 중인 충전 요청
create or replace function public.my_credits(p_center_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.my_member_id(p_center_id);
begin
  if v_member_id is null then
    perform private.raise_app_error('MEMBER_NOT_FOUND');
  end if;
  return jsonb_build_object(
    'balance', (select m.credit_balance from public.members m where m.id = v_member_id),
    'price', (select c.credit_price from public.centers c where c.id = p_center_id),
    'pending', (
      select jsonb_build_object('id', r.id, 'amount', r.amount, 'unit_price', r.unit_price, 'created_at', r.created_at)
      from public.credit_requests r
      where r.member_id = v_member_id and r.status = 'pending'
      order by r.created_at desc
      limit 1
    )
  );
end;
$$;

-- 충전 요청 (회원). 대기 중인 요청은 하나만
create or replace function public.request_credit_charge(p_center_id uuid, p_amount int)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid := private.my_member_id(p_center_id);
  v_id uuid;
begin
  if v_member_id is null then
    perform private.raise_app_error('MEMBER_NOT_FOUND');
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000 then
    perform private.raise_app_error('VALIDATION');
  end if;
  perform 1 from public.members where id = v_member_id for update;
  if exists (select 1 from public.credit_requests r where r.member_id = v_member_id and r.status = 'pending') then
    perform private.raise_app_error('CREDIT_REQUEST_PENDING');
  end if;
  insert into public.credit_requests (center_id, member_id, amount, unit_price)
  values (p_center_id, v_member_id, p_amount, (select c.credit_price from public.centers c where c.id = p_center_id))
  returning id into v_id;
  return v_id;
end;
$$;

-- 충전 요청 취소 (회원 본인)
create or replace function public.cancel_credit_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.credit_requests;
begin
  select * into v_request from public.credit_requests where id = p_request_id for update;
  if not found or v_request.member_id not in (select private.member_ids()) then
    perform private.raise_app_error('CREDIT_REQUEST_NOT_FOUND');
  end if;
  if v_request.status <> 'pending' then
    perform private.raise_app_error('CREDIT_REQUEST_CLOSED');
  end if;
  update public.credit_requests set status = 'cancelled', decided_at = now() where id = p_request_id;
end;
$$;

-- 충전 요청 승인·거절 (직원). 승인하면 요청한 만큼 충전. 바뀐 잔액을 돌려준다
create or replace function public.decide_credit_request(p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.credit_requests;
  v_staff_id uuid;
  v_balance int;
begin
  select * into v_request from public.credit_requests where id = p_request_id for update;
  if not found or not private.is_staff(v_request.center_id) then
    perform private.raise_app_error('CREDIT_REQUEST_NOT_FOUND');
  end if;
  if v_request.status <> 'pending' then
    perform private.raise_app_error('CREDIT_REQUEST_CLOSED');
  end if;
  v_staff_id := private.current_staff_id(v_request.center_id);
  update public.credit_requests
  set status = case when p_approve then 'approved' else 'rejected' end::public.credit_request_status,
      decided_at = now(), decided_by = v_staff_id
  where id = p_request_id;
  if p_approve then
    v_balance := private.add_credits(v_request.member_id, v_request.amount, 'charge', null, p_request_id, null,
      v_staff_id);
  end if;
  return jsonb_build_object('request_id', p_request_id, 'approved', p_approve, 'balance', v_balance);
end;
$$;

-- 직원이 직접 충전(+)·차감(-). 바뀐 잔액을 돌려준다
create or replace function public.adjust_credits(p_member_id uuid, p_delta int, p_memo text default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_center_id uuid;
begin
  select m.center_id into v_center_id
  from public.members m
  where m.id = p_member_id and m.status = 'active' and m.deleted_at is null;
  if not found or not private.is_staff(v_center_id) then
    perform private.raise_app_error('MEMBER_NOT_FOUND');
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 1000 then
    perform private.raise_app_error('VALIDATION');
  end if;
  return private.add_credits(p_member_id, p_delta,
    case when p_delta > 0 then 'charge' else 'adjust' end::public.credit_reason, null, null, p_memo,
    private.current_staff_id(v_center_id));
end;
$$;

revoke all on function public.my_credits(uuid) from public, anon;
revoke all on function public.request_credit_charge(uuid, int) from public, anon;
revoke all on function public.cancel_credit_request(uuid) from public, anon;
revoke all on function public.decide_credit_request(uuid, boolean) from public, anon;
revoke all on function public.adjust_credits(uuid, int, text) from public, anon;
grant execute on function public.my_credits(uuid) to authenticated;
grant execute on function public.request_credit_charge(uuid, int) to authenticated;
grant execute on function public.cancel_credit_request(uuid) to authenticated;
grant execute on function public.decide_credit_request(uuid, boolean) to authenticated;
grant execute on function public.adjust_credits(uuid, int, text) to authenticated;

-- 회원도 자기 센터 프로그램의 "사용 가능한 이용권" 연결을 본다 (내 이용권으로 들을 수 있는 수업 표시)
create policy program_allowed_products_select_member on public.program_allowed_products for select to authenticated
  using (center_id in (select private.member_center_ids()));
