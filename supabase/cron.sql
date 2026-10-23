-- ════════════════════════════════════════════════════════════════
--  파크골프 공략노트 — 매일 새벽 정리 예약 (한 번만 실행)
--  schema.sql 을 먼저 실행하고, Edge Function "api" 를 올린 다음에 실행하세요.
--  SQL Editor → New query → 붙여 넣고 Run
-- ════════════════════════════════════════════════════════════════
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 예전에 만든 같은 이름 예약이 있으면 지우고 다시 만듦
select cron.unschedule(jobid) from cron.job where jobname in ('lz-daily-api', 'lz-daily-sql');

-- 새벽 4시(한국): 오래 안 쓴 로그인 정리, 문의 정리, 안 쓰는 그림 지우기, 1년 지난 입금자 이름 가리기, 이력 3,000줄
select cron.schedule('lz-daily-api', '0 19 * * *', $$
  select net.http_post(
    url := 'https://achlxwcfcqaffazlxuxe.supabase.co/functions/v1/api',
    body := jsonb_build_object('a', '_cron', 'key', (select v from public.lz_prop where k = 'CRON_KEY')),
    headers := '{"Content-Type": "text/plain"}'::jsonb,
    timeout_milliseconds := 60000
  )
$$);

-- 새벽 4시 10분(한국): 백업(매일 7일치, 일요일 것은 8주치), 지난 캐시·지운 줄 기록 정리
select cron.schedule('lz-daily-sql', '10 19 * * *', $$ select public.lz_daily() $$);

select jobname, schedule from cron.job where jobname like 'lz-%';
