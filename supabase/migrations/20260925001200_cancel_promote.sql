-- ─────────────────────────────────────────────────────────────
-- 취소 · 대기 자동 승격
-- ─────────────────────────────────────────────────────────────

-- 빈자리만큼 대기 1순위부터 승격한다 (내부용). 예약 마감 이후에는 승격하지 않는다.
-- 대기 신청 때 고른 이용권을 우선 쓰고, 못 쓰게 됐으면 다른 유효 이용권을 고른다.
-- 쓸 수 있는 이용권이 없는 대기자는 promotion_failed 로 빼고 다음 순번으로 넘어간다.
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

    if v_pass_id is null then
      update public.bookings
      set status = 'cancelled', waitlist_position = null, cancelled_at = now(), cancel_reason = 'promotion_failed'
      where id = v_next.id;
      continue;
    end if;

    v_deducted := private.deduct_pass(v_pass_id);
    update public.bookings
    set status = 'booked', waitlist_position = null, member_pass_id = v_pass_id,
        pass_deducted = v_deducted, promoted_at = now()
    where id = v_next.id;
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

revoke all on function private.promote_waitlist(uuid) from public;

-- 예약 취소 (회원 본인 또는 직원)
--  - 대기 취소: 순번만 당긴다
--  - 무료 취소 기한 전: cancelled + 횟수 복구
--  - 무료 취소 기한 후: late_cancelled (차감 유지). 직원은 p_waive_penalty 로 복구해 줄 수 있다
--  - 자리가 나면 대기 1순위 자동 승격(센터 설정, 예약 마감 전까지)
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
  else
    v_new_status := 'late_cancelled';
  end if;

  update public.bookings
  set status = v_new_status, cancelled_at = now(), cancel_reason = v_reason,
      pass_deducted = case when v_restored then false else pass_deducted end
  where id = p_booking_id;
  update public.sessions set booked_count = booked_count - 1 where id = v_session.id;

  if v_rules.auto_promote_waitlist then
    v_promoted := private.promote_waitlist(v_session.id);
  end if;

  return jsonb_build_object('booking_id', p_booking_id, 'status', v_new_status, 'restored', v_restored,
    'promoted', v_promoted);
end;
$$;

revoke all on function public.cancel_booking(uuid, boolean) from public, anon;
grant execute on function public.cancel_booking(uuid, boolean) to authenticated;
