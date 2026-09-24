-- ─────────────────────────────────────────────────────────────
-- 이용권 부여 · 회원 삭제 요청(마스킹) · CSV 가져오기
-- ─────────────────────────────────────────────────────────────

-- 이용권 부여 (직원): 상품 스냅샷 + 만료일·횟수 자동 계산 + 결제 금액 기록
create or replace function public.grant_member_pass(
  p_member_id uuid,
  p_product_id uuid,
  p_start_date date,
  p_paid_amount int,
  p_paid_at timestamptz default now(),
  p_memo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_product public.pass_products;
  v_staff_id uuid;
  v_pass public.member_passes;
begin
  select * into v_member from public.members where id = p_member_id and status = 'active' and deleted_at is null;
  if not found then
    perform private.raise_app_error('MEMBER_NOT_FOUND');
  end if;
  v_staff_id := private.current_staff_id(v_member.center_id);
  if v_staff_id is null then
    perform private.raise_app_error('FORBIDDEN');
  end if;
  select * into v_product from public.pass_products
  where id = p_product_id and center_id = v_member.center_id and deleted_at is null and is_active;
  if not found then
    perform private.raise_app_error('PRODUCT_NOT_FOUND');
  end if;
  if p_start_date is null or p_paid_amount is null or p_paid_amount < 0 then
    perform private.raise_app_error('VALIDATION');
  end if;

  insert into public.member_passes (
    center_id, member_id, product_id, name, type, start_date, end_date, total_count, remaining_count,
    period_limit_count, period_limit_unit, paid_amount, paid_at, memo, created_by
  ) values (
    v_member.center_id, p_member_id, v_product.id, v_product.name, v_product.type, p_start_date,
    case when v_product.duration_days is null then null else p_start_date + v_product.duration_days - 1 end,
    v_product.total_count, v_product.total_count,
    v_product.period_limit_count, v_product.period_limit_unit,
    p_paid_amount, coalesce(p_paid_at, now()), nullif(trim(p_memo), ''), v_staff_id
  )
  returning * into v_pass;

  return jsonb_build_object(
    'member_pass_id', v_pass.id,
    'start_date', v_pass.start_date,
    'end_date', v_pass.end_date,
    'total_count', v_pass.total_count
  );
end;
$$;

-- 회원 삭제 요청 처리 (대표): 이름·전화번호 등 개인정보를 지우고 예약 통계만 남긴다.
-- 앞으로의 예약·대기는 취소(차감 복구)하고 대기자를 승격한다.
create or replace function public.withdraw_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members;
  v_booking record;
  v_cancelled int := 0;
begin
  select * into v_member from public.members where id = p_member_id and deleted_at is null for update;
  if not found then
    perform private.raise_app_error('MEMBER_NOT_FOUND');
  end if;
  if not private.is_owner(v_member.center_id) then
    perform private.raise_app_error('FORBIDDEN');
  end if;

  for v_booking in
    select b.id
    from public.bookings b
    join public.sessions s on s.id = b.session_id
    where b.member_id = p_member_id and b.status in ('booked', 'waitlisted') and s.starts_at > now()
  loop
    perform public.cancel_booking(v_booking.id, true);
    v_cancelled := v_cancelled + 1;
  end loop;

  update public.member_invites set revoked_at = now()
  where member_id = p_member_id and used_at is null and revoked_at is null;

  update public.members
  set name = private.mask_name(name),
      phone = null,
      birth = null,
      gender = null,
      memo = null,
      tags = '{}',
      user_id = null,
      marketing_agreed_at = null,
      notify_enabled = false,
      status = 'withdrawn',
      withdrawn_at = now(),
      deleted_at = now()
  where id = p_member_id;

  return jsonb_build_object('member_id', p_member_id, 'cancelled_bookings', v_cancelled);
end;
$$;

-- CSV 가져오기 (직원): 같은 전화번호가 이미 있으면 건너뛴다. 한 트랜잭션.
-- p_rows: [{name, phone, birth?, gender?, memo?, tags?[], joined_at?}]
create or replace function public.import_members(p_center_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_inserted int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_phone text;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    perform private.raise_app_error('VALIDATION');
  end if;
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_phone := v_row ->> 'phone';
    if exists (
      select 1 from public.members m
      where m.center_id = p_center_id and m.phone = v_phone and m.deleted_at is null
    ) then
      v_skipped := v_skipped || to_jsonb(v_phone);
      continue;
    end if;
    insert into public.members (center_id, name, phone, birth, gender, memo, tags, joined_at, privacy_agreed_at)
    values (
      p_center_id,
      v_row ->> 'name',
      v_phone,
      nullif(v_row ->> 'birth', '')::date,
      nullif(v_row ->> 'gender', '')::public.gender,
      nullif(v_row ->> 'memo', ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_row -> 'tags', '[]'::jsonb))), '{}'),
      coalesce(nullif(v_row ->> 'joined_at', '')::timestamptz, now()),
      now()
    );
    v_inserted := v_inserted + 1;
  end loop;
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

revoke all on function public.grant_member_pass(uuid, uuid, date, int, timestamptz, text) from public, anon;
grant execute on function public.grant_member_pass(uuid, uuid, date, int, timestamptz, text) to authenticated;
revoke all on function public.withdraw_member(uuid) from public, anon;
grant execute on function public.withdraw_member(uuid) to authenticated;
revoke all on function public.import_members(uuid, jsonb) from public, anon;
grant execute on function public.import_members(uuid, jsonb) to authenticated;
