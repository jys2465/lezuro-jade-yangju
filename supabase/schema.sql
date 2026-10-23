-- ════════════════════════════════════════════════════════════════
--  파크골프 공략노트 — 수파베이스 표 만들기
--  수파베이스 왼쪽 메뉴 SQL Editor → New query → 이 파일 내용을 통째로 붙여 넣고 Run.
--  여러 번 실행해도 안전해요(이미 있으면 그대로 둠).
-- ════════════════════════════════════════════════════════════════

-- 모든 자료는 lz 표 하나에 들어가요. tab = 예전 시트 이름(users, records…), d = 한 줄의 칸들(글자 배열)
create table if not exists public.lz (
  id  bigint generated always as identity primary key,
  tab text   not null,
  v   bigint not null default 0,          -- 바뀔 때마다 올라가는 순번(서버가 "바뀐 줄만" 받아 가려고)
  d   jsonb  not null
);
create sequence if not exists public.lz_v;
create index if not exists lz_v_i   on public.lz (v);
create index if not exists lz_tab_i on public.lz (tab, id);
create index if not exists lz_c0_i  on public.lz (tab, (d->>0));
create index if not exists lz_c1_i  on public.lz (tab, (d->>1));
create index if not exists lz_c5_i  on public.lz (tab, (d->>5));

-- 지운 줄 기록(서버가 메모리에서도 지우려고). 매일 정리돼요
create table if not exists public.lz_gone (id bigint primary key, tab text not null, v bigint not null);
create index if not exists lz_gone_v_i on public.lz_gone (v);

-- 잠깐 기억하는 값(접속 중, 좌석, 로그인 시도 수…) — 예전 앱스크립트 캐시
create table if not exists public.lz_kv (k text primary key, v text not null, exp bigint not null);
-- 비밀 값(PEPPER: 비밀번호 암호화 열쇠, CRON_KEY: 매일 정리 열쇠)
create table if not exists public.lz_prop (k text primary key, v text not null);
-- 백업(매일 7일치, 일요일 것은 8주치)
create table if not exists public.lz_bak (at timestamptz not null, kind text not null, tab text not null, id bigint not null, d jsonb not null);
create index if not exists lz_bak_at_i on public.lz_bak (at);

-- 줄 길이 맞추기(새 칸이 생겼을 때)
create or replace function public.lz_pad(d jsonb, n int) returns jsonb language sql immutable as $$
  select case when jsonb_array_length(d) >= n then d
    else d || (select coalesce(jsonb_agg('""'::jsonb), '[]'::jsonb) from generate_series(jsonb_array_length(d), n - 1)) end
$$;

-- 바뀌면 순번 올리기, 지우면 기록(큰 표: 기록·그림·이력·로고는 서버 메모리에 두지 않아서 필요 없음)
create or replace function public.lz_touch() returns trigger language plpgsql as $$
begin
  if new.tab in ('records', 'images', 'log', 'logos') then new.v := 0; else new.v := nextval('public.lz_v'); end if;
  return new;
end $$;
create or replace function public.lz_drop() returns trigger language plpgsql as $$
begin
  if old.tab not in ('records', 'images', 'log', 'logos') then
    insert into public.lz_gone (id, tab, v) values (old.id, old.tab, nextval('public.lz_v')) on conflict (id) do update set v = excluded.v;
  end if;
  return old;
end $$;
drop trigger if exists lz_touch_t on public.lz;
create trigger lz_touch_t before insert or update on public.lz for each row execute function public.lz_touch();
drop trigger if exists lz_drop_t on public.lz;
create trigger lz_drop_t after delete on public.lz for each row execute function public.lz_drop();

-- 보안: 앱(공개 열쇠)으로는 표를 직접 못 읽고 못 씀. 모든 요청은 Edge Function "api" 를 거쳐요
alter table public.lz      enable row level security;
alter table public.lz_gone enable row level security;
alter table public.lz_kv   enable row level security;
alter table public.lz_prop enable row level security;
alter table public.lz_bak  enable row level security;
revoke all on public.lz, public.lz_gone, public.lz_kv, public.lz_prop, public.lz_bak from anon, authenticated;

-- 매일 정리 열쇠(처음 한 번 자동으로 만듦)
insert into public.lz_prop (k, v) values ('CRON_KEY', md5(random()::text || clock_timestamp()::text)) on conflict (k) do nothing;

-- 매일 SQL 정리: 백업, 지난 캐시 지우기, 지운 줄 기록 정리
create or replace function public.lz_daily() returns text language plpgsql security definer set search_path = public as $$
declare x bigint;
begin
  perform pg_advisory_xact_lock(7001);                                  -- 앱 저장과 겹치지 않게(같은 잠금)
  insert into lz_bak (at, kind, tab, id, d)
    select now(), case when extract(isodow from now() at time zone 'Asia/Seoul') = 7 then 'week' else 'day' end, tab, id, d
    from lz where tab in ('users', 'courses', 'records', 'payments', 'refunds', 'branches', 'settings', 'notices', 'faq', 'qna', 'uses', 'prefs');
  delete from lz_bak where (kind = 'day' and at < now() - interval '7 days') or (kind = 'week' and at < now() - interval '56 days');
  delete from lz_kv where exp < (extract(epoch from now()) * 1000)::bigint;
  select coalesce(max(v), 0) into x from lz_gone;
  delete from lz_gone where v <= x;
  insert into lz_prop (k, v) values ('purged', x::text) on conflict (k) do update set v = excluded.v;
  return 'ok';
end $$;

-- 관리자 비밀번호를 잊었을 때: SQL Editor 에서  select lz_reset_admin();  → 새 6자리 번호가 나와요(처음 들어가면 바로 바꾸게 됨)
create extension if not exists pgcrypto with schema extensions;
create or replace function public.lz_reset_admin() returns text language plpgsql security definer set search_path = public, extensions as $$
declare r record; pin text; salt text; pep text;
begin
  perform pg_advisory_xact_lock(7001);
  select v into pep from lz_prop where k = 'PEPPER';
  if pep is null then return 'PEPPER 가 없어요. 자료 옮기기를 먼저 해 주세요.'; end if;
  select * into r from lz where tab = 'users' and d->>1 = 'admin' order by (d->>0 = '관리자') desc, id limit 1;
  if r is null then return '관리자 계정이 없어요.'; end if;
  loop
    pin := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when pin !~ '^(\d)\1+$' and position(pin in '0123456789') = 0 and position(pin in '9876543210') = 0;
  end loop;
  salt := substr(md5(random()::text || clock_timestamp()::text), 1, 16);
  update lz set d = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(lz_pad(d, 27),
      '{4}', to_jsonb(encode(digest(salt || ':' || pin || ':' || pep, 'sha256'), 'hex'))),
      '{5}', to_jsonb(salt)), '{6}', '"1"'), '{7}', '"1"'), '{8}', '"0"'), '{9}', '"0"'), '{21}', '"0"'), '{22}', '"6"')
    where id = r.id;
  delete from lz where tab = 'sessions' and d->>1 = r.d->>14;
  return (r.d->>0) || ' 의 새 비밀번호: ' || pin;
end $$;
revoke all on function public.lz_reset_admin() from anon, authenticated, public;
revoke all on function public.lz_daily() from anon, authenticated, public;

-- ── 구글 시트에서 옮겨 오기(앱스크립트 "옮기기.gs" 가 비밀 열쇠로 부름. 앱에서는 못 부름) ──
create or replace function public.lz_import_begin(p_pepper text, p_force boolean default false) returns text language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(7001);
  if coalesce(length(p_pepper), 0) < 20 then raise exception 'PEPPER 가 올바르지 않아요'; end if;
  if exists (select 1 from lz_prop where k = 'imported') and not p_force then
    raise exception '이미 옮기기를 마쳤어요. 다시 옮기면 수파베이스에서 그 뒤에 바뀐 자료가 모두 지워져요. 정말 다시 하려면 옮기기.gs 의 FORCE 를 true 로 바꿔 실행하세요.';
  end if;
  delete from lz_prop where k = 'imported';
  alter table lz disable trigger lz_drop_t;
  delete from lz where id is not null; delete from lz_gone where id is not null; delete from lz_kv where k is not null;   -- (수파베이스는 WHERE 없는 DELETE 를 막아요)
  alter table lz enable trigger lz_drop_t;
  insert into lz_prop (k, v) values ('PEPPER', p_pepper) on conflict (k) do update set v = excluded.v;
  insert into lz_prop (k, v) values ('purged', nextval('lz_v')::text) on conflict (k) do update set v = excluded.v;   -- 이미 돌던 서버는 모두 새로 받게
  return 'ok';
end $$;
create or replace function public.lz_import(p_tab text, p_rows jsonb) returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform pg_advisory_xact_lock(7001);
  insert into lz (tab, d) select p_tab, x from jsonb_array_elements(p_rows) with ordinality as t(x, o) order by o;
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function public.lz_counts() returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(tab, n), '{}'::jsonb) from (select tab, count(*) as n from lz group by tab) x
$$;
create or replace function public.lz_import_done() returns text language sql security definer set search_path = public as $$
  insert into lz_prop (k, v) values ('imported', now()::text) on conflict (k) do update set v = excluded.v returning 'ok'
$$;
drop function if exists public.lz_import_begin(text);
revoke all on function public.lz_import_begin(text, boolean), public.lz_import(text, jsonb), public.lz_counts(), public.lz_import_done() from anon, authenticated, public;
grant execute on function public.lz_import_begin(text, boolean), public.lz_import(text, jsonb), public.lz_counts(), public.lz_import_done() to service_role;

-- ── 보기 편한 표(읽기 전용): Table Editor 에서 "v_회원" 처럼 골라 보세요. 고치는 것은 앱에서 해요 ──
create or replace view public."v_회원" with (security_invoker = true) as
  select id, d->>14 as 회원번호, d->>0 as 닉네임, d->>1 as 등급, d->>2 as 시작, d->>3 as 종료, d->>15 as 기본매장, d->>7 as 사용,
    to_timestamp(nullif(d->>10, '')::bigint / 1000) as 가입, to_timestamp(nullif(d->>13, '')::bigint / 1000) as 마지막접속, d->>23 as 가입방법, d->>25 as 추천인
  from public.lz where tab = 'users';
create or replace view public."v_결제" with (security_invoker = true) as
  select id, d->>0 as 번호, d->>14 as 닉네임, d->>2 as 이용권, d->>3 as 금액, d->>4 as 방법, d->>5 as 입금자, d->>6 as 상태, d->>10 as 시작, d->>11 as 종료,
    to_timestamp(nullif(d->>7, '')::bigint / 1000) as 신청, to_timestamp(nullif(nullif(d->>8, ''), '0')::bigint / 1000) as 처리
  from public.lz where tab = 'payments';
create or replace view public."v_코스" with (security_invoker = true) as
  select id, d->>0 as 코스번호, d->>1 as 이름, d->>8 as 단계, d->>3 as 등록한회원 from public.lz where tab = 'courses';
create or replace view public."v_매장" with (security_invoker = true) as
  select id, d->>0 as 코드, d->>1 as 이름, d->>2 as 열림, d->>3 as 순서 from public.lz where tab = 'branches';
create or replace view public."v_환불" with (security_invoker = true) as
  select id, d->>0 as 번호, d->>15 as 닉네임, d->>4 as 상태, d->>9 as 금액, d->>5 as 은행, to_timestamp(nullif(d->>3, '')::bigint / 1000) as 신청 from public.lz where tab = 'refunds';
create or replace view public."v_표별줄수" with (security_invoker = true) as
  select tab as 표, count(*) as 줄수 from public.lz group by tab order by tab;
revoke all on public."v_회원", public."v_결제", public."v_코스", public."v_매장", public."v_환불", public."v_표별줄수" from anon, authenticated;

select '표 만들기 끝 ✅' as 결과;
