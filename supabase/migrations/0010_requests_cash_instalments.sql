-- Step 3 (17 Nov 2026): requests from building managers, cash waiting for the accountant, instalment plans,
-- a due day for one owner. Safe to run again.
-- Requests: new possessions, instalment plans for old arrears, a different due date; the Admin can also ask for changes.
alter table approvals drop constraint if exists approvals_kind_check;
alter table approvals add constraint approvals_kind_check check (kind in ('discount','generator','plan','rate','adjust','rates','rules','fine','announce','possession','instalments','due'));
alter table approvals drop constraint if exists approvals_status_check;
alter table approvals add constraint approvals_status_check check (status in ('pending','approved','rejected','withdrawn','changes'));
-- Money waiting to be checked: bank-transfer screenshots (owners) and cash recorded by building managers.
alter table proofs add column if not exists kind text not null default 'transfer';
alter table proofs drop constraint if exists proofs_kind_check;
alter table proofs add constraint proofs_kind_check check (kind in ('transfer','cash'));
alter table proofs add column if not exists ref text;
alter table proofs add column if not exists note text;
alter table proofs add column if not exists by_id uuid;
alter table proofs add column if not exists by_name text;
alter table proofs add column if not exists paid_on date;
alter table proofs add column if not exists checked_by text;
alter table proofs add column if not exists reply text;
-- Owners: an approved instalment plan for old arrears, and their own due day (day of the month after the bill).
alter table owners add column if not exists instalments jsonb;
alter table owners add column if not exists due_day int;
