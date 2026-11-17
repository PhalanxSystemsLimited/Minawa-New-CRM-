-- Step 4: possession-based billing dates and the 25 Nov 2026 go-live.
-- New customers (possessions recorded in the CRM) carry their first bill date (possession + 25 days); it sets their
-- billing day. Existing customers are billed on their possession day (or the 25th with no date on file).
alter table owners add column if not exists first_bill date;

-- Go-live switch for the live projects: statements of dues on 25 Nov 2026, due 15 Dec; monthly charges from the
-- project's go-live month (January 2027). Keeps every other rule as it is.
update project_settings
   set rules = rules || jsonb_build_object('startOn', '2026-11-25', 'graceDays', coalesce((rules->>'graceDays')::int, 25), 'dueDays', 15)
 where project in (select id from projects where live and go_live = '2027-01-01');
