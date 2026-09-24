-- ─────────────────────────────────────────────────────────────
-- 프로그램 저장: 프로그램 행 + 사용 가능한 이용권 목록을 한 트랜잭션으로.
-- security invoker 라서 RLS(대표만 쓰기)가 그대로 적용된다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.save_program(
  p_center_id uuid,
  p_name text,
  p_type public.program_type,
  p_default_capacity int,
  p_duration_min int,
  p_color text,
  p_allowed_product_ids uuid[],
  p_id uuid default null,
  p_default_instructor_id uuid default null,
  p_description text default null
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
      center_id, name, type, default_capacity, duration_min, color, default_instructor_id, description, sort_order
    )
    values (
      p_center_id, p_name, p_type, p_default_capacity, p_duration_min, p_color, p_default_instructor_id,
      nullif(trim(p_description), ''),
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
        description = nullif(trim(p_description), '')
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

revoke all on function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text)
  from public, anon;
grant execute on function public.save_program(uuid, text, public.program_type, int, int, text, uuid[], uuid, uuid, text)
  to authenticated;
