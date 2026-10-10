-- 센터 대표번호로 050X 안심번호(12자리, 예: 0507-1374-3962)를 받는다
alter table public.centers drop constraint centers_phone_check;
alter table public.centers add constraint centers_phone_check check (phone ~ '^[0-9]{8,12}$');
