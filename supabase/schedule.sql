-- ============================================
-- MovieTracker — production scheduling setup
-- Run once in Supabase Dashboard -> SQL Editor
-- (or: psql "$SUPABASE_DB_URL" -f supabase/schedule.sql)
--
-- What it does:
--   1. pg_cron  : fires a job every minute
--   2. pg_net   : that job POSTs to the check-alerts Edge Function
--   3. check-alerts scans all active alerts and pings Telegram
--      within ~60 seconds of bookings opening
-- ============================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Idempotent: remove any previous version of the job
do $$
begin
  if exists (select 1 from cron.job where jobname = 'check-alerts-every-minute') then
    perform cron.unschedule('check-alerts-every-minute');
  end if;
end $$;

-- CRON_SECRET must match the Supabase secret of the same name
-- (set with: supabase secrets set CRON_SECRET=...)
select cron.schedule(
  'check-alerts-every-minute',
  '* * * * *',
  $$select net.http_post(
    url := 'https://nnctxsaqjrmpxswhxxbn.supabase.co/functions/v1/check-alerts',
    headers := '{"content-type":"application/json","apikey":"sb_publishable_N4VMUCUMFeTAB0PWN4FXXA_S4EAyp-Z","x-cron-secret":"REPLACE_WITH_CRON_SECRET"}'::jsonb,
    body := '{}',
    timeout_milliseconds := 55000
  ) as request_id;$$
);
