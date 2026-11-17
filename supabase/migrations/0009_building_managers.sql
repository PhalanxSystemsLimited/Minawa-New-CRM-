-- Building managers (17 Nov 2026): a third staff role, and the buildings (projects) each manager may open.
-- Run once in the Supabase SQL editor before deploying this update. Safe to run again.
alter table staff drop constraint if exists staff_role_check;
alter table staff add constraint staff_role_check check (role in ('admin', 'accountant', 'manager'));
alter table staff add column if not exists projects text[] not null default '{}';
