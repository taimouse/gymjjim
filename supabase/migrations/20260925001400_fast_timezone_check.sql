-- pg_timezone_names 는 시간대 파일 전체를 읽어 느리다. 변환을 한 번 시도하는 방식으로 바꾼다.
create or replace function private.assert_valid_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform now() at time zone new.timezone;
  exception when invalid_parameter_value then
    raise exception using errcode = 'P0001', message = 'INVALID_TIMEZONE';
  end;
  return new;
end;
$$;
