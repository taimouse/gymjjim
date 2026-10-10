-- ─────────────────────────────────────────────────────────────
-- 시드: 예약 샘플
--  - 지난 수업: 출석(attended) 위주 + 일부 노쇼
--  - 다가오는 수업: 예약(booked), 내일 이후 첫 WOD 는 정원 8명으로 줄여 마감 + 대기 3명
--  - 규칙(유효 이용권, 허용 상품, 정지, 주 n회 제한, 시간 겹침)을 지키며 만든다
--  - 마지막에 세션 카운터와 이용권 잔여 횟수를 예약 기준으로 다시 계산한다
-- ─────────────────────────────────────────────────────────────
do $$
declare
  v_center constant uuid := 'c0000000-0000-4000-8000-000000000001';
  v_tz constant text := 'Asia/Seoul';
  v_wod constant uuid := 'f0000000-0000-4000-8000-000000000002';
  -- 잔여 횟수가 적은 회원은 무작위 예약에서 제외 (상태 예시 유지)
  v_skip constant uuid[] := array[
    'd0000000-0000-4000-8000-000000000002',
    'd0000000-0000-4000-8000-000000000007',
    'd0000000-0000-4000-8000-000000000019'
  ]::uuid[];
  v_full_session uuid;
  s record;
  m record;
  v_date date;
  v_booked int;
  v_waitlist int;
  v_rate int;
  v_period_count int;
  v_status public.booking_status;
begin
  select id into v_full_session
  from public.sessions
  where center_id = v_center and program_id = v_wod and starts_at > now() + interval '20 hours'
  order by starts_at
  limit 1;

  update public.sessions set capacity = 8 where id = v_full_session;

  for s in
    select se.id, se.program_id, se.starts_at, se.ends_at, se.capacity, p.type as program_type
    from public.sessions se
    join public.programs p on p.id = se.program_id
    where se.center_id = v_center
    order by se.starts_at
  loop
    v_date := (s.starts_at at time zone v_tz)::date;
    v_booked := 0;
    v_waitlist := 0;
    v_rate := case when s.id = v_full_session or s.program_type = 'private' then 100 else 50 end;

    for m in
      select distinct on (mp.member_id)
        mp.member_id, mp.id as pass_id, mp.type as pass_type, mp.remaining_count,
        mp.period_limit_count, mp.period_limit_unit
      from public.member_passes mp
      join public.program_allowed_products pap
        on pap.program_id = s.program_id and pap.product_id = mp.product_id
      where mp.center_id = v_center
        and mp.status = 'active'
        and mp.deleted_at is null
        and mp.member_id <> all (v_skip)
        and mp.start_date <= v_date
        and (mp.end_date is null or mp.end_date >= v_date)
        and not exists (
          select 1 from public.pass_holds h
          where h.member_pass_id = mp.id and v_date between h.start_date and h.end_date
        )
        and abs(hashtext(s.id::text || mp.member_id::text)) % 100 < v_rate
      order by mp.member_id, mp.end_date nulls last
    loop
      -- 남은 횟수(시드 예약으로 이미 차감한 만큼 반영)
      continue when m.remaining_count is not null and m.remaining_count <= (
        select count(*) from public.bookings b where b.member_pass_id = m.pass_id and b.pass_deducted
      );
      -- 시간이 겹치는 예약이 있으면 건너뜀
      continue when exists (
        select 1
        from public.bookings b
        join public.sessions o on o.id = b.session_id
        where b.member_id = m.member_id
          and b.status in ('booked', 'waitlisted', 'attended', 'no_show')
          and o.starts_at < s.ends_at and o.ends_at > s.starts_at
      );
      -- 주/월 n회 제한
      if m.period_limit_count is not null then
        select count(*) into v_period_count
        from public.bookings b
        join public.sessions o on o.id = b.session_id
        where b.member_pass_id = m.pass_id
          and b.status in ('booked', 'attended', 'no_show', 'late_cancelled')
          and date_trunc(m.period_limit_unit::text, o.starts_at at time zone v_tz)
            = date_trunc(m.period_limit_unit::text, s.starts_at at time zone v_tz);
        continue when v_period_count >= m.period_limit_count;
      end if;

      if v_booked < s.capacity then
        v_status := case
          when s.ends_at > now() then 'booked'
          when abs(hashtext(m.member_id::text || s.id::text)) % 10 = 0 then 'no_show'
          else 'attended'
        end;
        insert into public.bookings (
          center_id, session_id, member_id, member_pass_id, status, pass_deducted, booked_by, attended_at, created_at
        ) values (
          v_center, s.id, m.member_id, m.pass_id, v_status, m.pass_type <> 'period', 'member',
          case when v_status = 'attended' then s.starts_at end,
          least(now(), s.starts_at - interval '1 day')
        );
        v_booked := v_booked + 1;
      elsif s.starts_at > now() and v_waitlist < 3 then
        v_waitlist := v_waitlist + 1;
        insert into public.bookings (
          center_id, session_id, member_id, member_pass_id, status, waitlist_position, booked_by, created_at
        ) values (
          v_center, s.id, m.member_id, m.pass_id, 'waitlisted', v_waitlist, 'member', now() - interval '1 hour'
        );
      end if;
    end loop;
  end loop;

  -- 김민지(로그인 회원 2): 다가오는 수업 1회 예약 → 10회권 잔여 3 → 2
  insert into public.bookings (center_id, session_id, member_id, member_pass_id, status, pass_deducted, booked_by)
  select v_center, se.id, mp.member_id, mp.id, 'booked', true, 'member'
  from public.sessions se
  join public.member_passes mp on mp.member_id = 'd0000000-0000-4000-8000-000000000002'
  join public.program_allowed_products pap on pap.program_id = se.program_id and pap.product_id = mp.product_id
  where se.center_id = v_center
    and se.starts_at > now() + interval '1 day'
    and (se.starts_at at time zone v_tz)::date <= mp.end_date
    and (select count(*) from public.bookings b where b.session_id = se.id and b.status = 'booked') < se.capacity
  order by se.starts_at
  limit 1;

  -- 취소 예시: 다가오는 예약 중 2건은 무료 취소, 1건은 늦은 취소(차감 유지)
  with upcoming as (
    select b.id, row_number() over (order by b.created_at, b.id) as rn
    from public.bookings b
    join public.sessions se on se.id = b.session_id
    where b.center_id = v_center and b.status = 'booked' and se.starts_at > now() + interval '4 hours'
      and b.session_id <> coalesce(v_full_session, '00000000-0000-0000-0000-000000000000'::uuid)
      and b.member_id <> 'd0000000-0000-4000-8000-000000000002'
  )
  update public.bookings b set
    status = case when u.rn <= 2 then 'cancelled'::public.booking_status else 'late_cancelled' end,
    pass_deducted = case when u.rn <= 2 then false else b.pass_deducted end,
    cancelled_at = now() - interval '2 hours',
    cancel_reason = 'member'
  from upcoming u
  where b.id = u.id and u.rn <= 3;

  -- 카운터·잔여 횟수 재계산
  update public.sessions se set
    booked_count = (
      select count(*) from public.bookings b
      where b.session_id = se.id and b.status in ('booked', 'attended', 'no_show')
    ),
    waitlist_count = (
      select count(*) from public.bookings b where b.session_id = se.id and b.status = 'waitlisted'
    )
  where se.center_id = v_center;

  update public.member_passes mp set
    remaining_count = mp.remaining_count - (
      select count(*) from public.bookings b where b.member_pass_id = mp.id and b.pass_deducted
    )
  where mp.center_id = v_center and mp.remaining_count is not null;
end;
$$;
