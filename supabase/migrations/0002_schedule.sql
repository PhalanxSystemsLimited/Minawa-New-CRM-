-- Schedule the automatic jobs with pg_cron + pg_net (both are built into Supabase: Database > Extensions).
-- Before running this file, replace the two placeholders:
--   https://YOUR-CRM-DOMAIN   the CRM's address, e.g. https://crm.minawagroup.pk
--   YOUR_CRON_SECRET          the same value as CRON_SECRET in the CRM's environment
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Daily billing run at 11:00 Pakistan time (06:00 UTC): bills on the 25th, reminders, fines, final notices, flags, then sends.
select cron.unschedule(jobid) from cron.job where jobname in ('minawa-daily', 'minawa-dispatch');
select cron.schedule('minawa-daily', '0 6 * * *', $$
  select net.http_post(
    url := 'https://YOUR-CRM-DOMAIN/api/cron/daily',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer YOUR_CRON_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);

-- Every 10 minutes: retry unsent WhatsApp messages and check open Safepay links (in case a webhook was missed).
select cron.schedule('minawa-dispatch', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://YOUR-CRM-DOMAIN/api/cron/dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer YOUR_CRON_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
$$);
