-- ─────────────────────────────────────────────────────────────
-- 수업 수정·이동 (직원)
--  - p_scope: 'this'(이 수업만) | 'following'(같은 반복 묶음의 이후 전체)
--  - 시간 변경은 선택한 수업의 이동 폭(delta)과 새 길이를 이후 수업에도 똑같이 적용
--  - 정원이 늘면 대기자 자동 승격, p_notify 면 예약·대기자에게 변경 알림(알림 설정과 무관)
-- ─────────────────────────────────────────────────────────────
create or replace function public.update_session(
  p_session_id uuid,
  p_scope text default 'this',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_instructor_id uuid default null,
  p_clear_instructor boolean default false,
  p_capacity int default null,
  p_note text default null,
  p_notify boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base public.sessions;
  v_target record;
  v_delta interval;
  v_duration interval;
  v_time_changed boolean;
  v_updated int := 0;
  v_notified int := 0;
  v_booking record;
  v_payload jsonb;
begin
  if p_scope not in ('this', 'following') then
    perform private.raise_app_error('VALIDATION');
  end if;
  select * into v_base from public.sessions where id = p_session_id and deleted_at is null;
  if not found then
    perform private.raise_app_error('SESSION_NOT_FOUND');
  end if;
  if not private.is_staff(v_base.center_id) then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  if v_base.status = 'cancelled' then
    perform private.raise_app_error('SESSION_CANCELLED');
  end if;
  if (p_starts_at is null) <> (p_ends_at is null) or (p_starts_at is not null and p_ends_at <= p_starts_at) then
    perform private.raise_app_error('INVALID_DATE_RANGE');
  end if;
  if p_capacity is not null and (p_capacity < 1 or p_capacity > 500) then
    perform private.raise_app_error('VALIDATION');
  end if;

  v_time_changed := p_starts_at is not null and (p_starts_at <> v_base.starts_at or p_ends_at <> v_base.ends_at);
  v_delta := case when p_starts_at is null then interval '0' else p_starts_at - v_base.starts_at end;
  v_duration := case when p_starts_at is null then null else p_ends_at - p_starts_at end;

  for v_target in
    select s.*
    from public.sessions s
    where s.status = 'scheduled'
      and s.deleted_at is null
      and (
        s.id = p_session_id
        or (
          p_scope = 'following'
          and v_base.recurrence_group_id is not null
          and s.recurrence_group_id = v_base.recurrence_group_id
          and s.starts_at > v_base.starts_at
        )
      )
    order by s.starts_at
    for update
  loop
    update public.sessions
    set starts_at = case when v_time_changed then v_target.starts_at + v_delta else starts_at end,
        ends_at = case when v_time_changed then v_target.starts_at + v_delta + v_duration else ends_at end,
        instructor_id = case
          when p_clear_instructor then null
          when p_instructor_id is not null then p_instructor_id
          else instructor_id
        end,
        capacity = coalesce(p_capacity, capacity),
        note = case when p_note is null then note else nullif(trim(p_note), '') end
    where id = v_target.id;
    v_updated := v_updated + 1;

    if p_capacity is not null and p_capacity > v_target.capacity
       and (private.center_rules(v_target.center_id)).auto_promote_waitlist then
      perform private.promote_waitlist(v_target.id);
    end if;

    if v_time_changed and p_notify then
      v_payload := private.session_payload(v_target.id)
        || jsonb_build_object('previous_starts_at', v_target.starts_at, 'previous_ends_at', v_target.ends_at);
      for v_booking in
        select b.id, b.member_id from public.bookings b
        where b.session_id = v_target.id and b.status in ('booked', 'waitlisted')
      loop
        perform private.enqueue_notification(
          v_target.center_id, v_booking.member_id, 'session_changed',
          v_payload || jsonb_build_object('booking_id', v_booking.id),
          'session_changed:' || v_booking.id || ':' || extract(epoch from v_target.starts_at + v_delta)::bigint,
          true
        );
        v_notified := v_notified + 1;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('updated', v_updated, 'notified', v_notified);
end;
$$;

revoke all on function public.update_session(uuid, text, timestamptz, timestamptz, uuid, boolean, int, text, boolean)
  from public, anon;
grant execute on function public.update_session(uuid, text, timestamptz, timestamptz, uuid, boolean, int, text, boolean)
  to authenticated;
