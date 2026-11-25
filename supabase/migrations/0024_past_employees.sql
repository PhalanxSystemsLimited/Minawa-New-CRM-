-- Past employees (24 Nov 2026): the Admin deletes an employee on Staff & connections; they move to Past employees.
-- Their login is turned off (active = false) and they can't sign in; their records stay. New columns only. Safe to run again.
alter table staff add column if not exists left_on date;
alter table staff add column if not exists left_reason text;
alter table staff add column if not exists left_by text;
