-- ─────────────────────────────────────────────────────────────
-- 출석·노쇼(되돌리기 포함) · 폐강 · 이용권 정지
-- ─────────────────────────────────────────────────────────────

-- 출석 체크. 'booked' 로 되돌릴 수 있다 (되돌리기 토스트). 좌석·차감은 바뀌지 않는다.
create or replace function public.set_attendance(p_booking_id uuid, p_status public.booking_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if p_status not in ('attended', 'no_show', 'booked') then
    perform private.raise_app_error('INVALID_STATUS');
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    perform private.raise_app_error('BOOKING_NOT_FOUND');
  end if;
  if not private.is_staff(v_booking.center_id) then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  if v_booking.status not in ('booked', 'attended', 'no_show') then
    perform private.raise_app_error('INVALID_STATUS');
  end if;

  update public.bookings
  set status = p_status,
      attended_at = case when p_status = 'attended' then coalesce(attended_at, now()) end
  where id = p_booking_id;

  return jsonb_build_object('booking_id', p_booking_id, 'status', p_status, 'previous_status', v_booking.status);
end;
$$;

-- 폐강: 예약·대기 전체 취소 + 차감 복구 + 알림(설정과 무관하게 발송). 알림 대상을 돌려준다.
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
    select b.id, b.member_id, b.member_pass_id, b.status, b.pass_deducted, m.name as member_name
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
    update public.bookings
    set status = 'cancelled', waitlist_position = null, pass_deducted = false,
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

-- 이용권 정지(홀딩). 정지 일수만큼 만료일을 연장한다. 정지 기간 안에 예약이 있으면 거부.
create or replace function public.create_hold(
  p_member_pass_id uuid,
  p_start_date date,
  p_end_date date,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.member_passes;
  v_staff_id uuid;
  v_timezone text;
  v_days int;
  v_hold_id uuid;
  v_new_end date;
begin
  select * into v_pass from public.member_passes where id = p_member_pass_id and deleted_at is null for update;
  if not found then
    perform private.raise_app_error('PASS_NOT_FOUND');
  end if;
  v_staff_id := private.current_staff_id(v_pass.center_id);
  if v_staff_id is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  if v_pass.status <> 'active' then
    perform private.raise_app_error('PASS_NOT_FOUND');
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date
     or p_end_date - p_start_date + 1 > 365 then
    perform private.raise_app_error('INVALID_DATE_RANGE');
  end if;
  if p_start_date < v_pass.start_date or (v_pass.end_date is not null and p_start_date > v_pass.end_date) then
    perform private.raise_app_error('HOLD_OUT_OF_RANGE');
  end if;
  if exists (
    select 1 from public.pass_holds h
    where h.member_pass_id = p_member_pass_id
      and daterange(h.start_date, h.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
  ) then
    perform private.raise_app_error('HOLD_OVERLAP');
  end if;

  select c.timezone into v_timezone from public.centers c where c.id = v_pass.center_id;
  if exists (
    select 1
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.member_pass_id = p_member_pass_id
      and b.status in ('booked', 'waitlisted', 'attended', 'no_show')
      and (s.starts_at at time zone v_timezone)::date between p_start_date and p_end_date
  ) then
    perform private.raise_app_error('HOLD_HAS_BOOKINGS');
  end if;

  v_days := p_end_date - p_start_date + 1;
  insert into public.pass_holds (center_id, member_pass_id, start_date, end_date, reason, created_by)
  values (v_pass.center_id, p_member_pass_id, p_start_date, p_end_date, nullif(trim(p_reason), ''), v_staff_id)
  returning id into v_hold_id;

  if v_pass.end_date is not null then
    update public.member_passes set end_date = end_date + v_days where id = p_member_pass_id
    returning end_date into v_new_end;
  end if;

  return jsonb_build_object(
    'hold_id', v_hold_id,
    'days', v_days,
    'previous_end_date', v_pass.end_date,
    'new_end_date', v_new_end
  );
end;
$$;

revoke all on function public.set_attendance(uuid, public.booking_status) from public, anon;
grant execute on function public.set_attendance(uuid, public.booking_status) to authenticated;
revoke all on function public.cancel_session(uuid, text) from public, anon;
grant execute on function public.cancel_session(uuid, text) to authenticated;
revoke all on function public.create_hold(uuid, date, date, text) from public, anon;
grant execute on function public.create_hold(uuid, date, date, text) to authenticated;
