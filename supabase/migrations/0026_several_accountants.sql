-- A building manager can report to one or more accountants (26 Nov 2026), ticked by the Admin on Staff & connections.
-- New column only; the accountant already picked (reports_to, 0025) is copied in. reports_to stays (the first one).
-- Safe to run again.
alter table staff add column if not exists accountant_ids jsonb not null default '[]';
update staff set accountant_ids = jsonb_build_array(reports_to)
  where reports_to is not null and reports_to <> '' and accountant_ids = '[]'::jsonb;
