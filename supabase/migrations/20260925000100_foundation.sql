-- ─────────────────────────────────────────────────────────────
-- 기반: 스키마, 확장, 공용 트리거 함수
-- ─────────────────────────────────────────────────────────────

-- RLS 헬퍼·내부 함수는 API(PostgREST)에 노출되지 않는 private 스키마에 둔다.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- 이용권 정지 기간 중복 방지(exclusion constraint)에 사용
create extension if not exists btree_gist with schema extensions;

-- updated_at 자동 갱신
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 센터 시간대 유효성 검사 (pg_timezone_names 기준)
create or replace function private.assert_valid_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception using errcode = 'P0001', message = 'INVALID_TIMEZONE';
  end if;
  return new;
end;
$$;

-- 앱 전역 에러 코드는 message 에 코드 문자열만 담아 던진다. (예: SESSION_FULL)
-- 클라이언트는 error.message 를 i18n 키(errors.<CODE>)로 변환한다.
create or replace function private.raise_app_error(p_code text, p_detail jsonb default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code,
    detail = coalesce(p_detail::text, '');
end;
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.assert_valid_timezone() from public;
revoke all on function private.raise_app_error(text, jsonb) from public;
-- 사용자 권한으로 도는 트리거에서도 에러 코드를 던질 수 있게 한다 (예외를 던지는 것 외에 하는 일이 없다)
grant execute on function private.raise_app_error(text, jsonb) to authenticated;
