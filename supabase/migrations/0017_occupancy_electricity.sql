-- Phase 3 (18 Nov 2026): customers leaving (meter readings in and out), electricity bills with meter readings, and
-- payments marked for maintenance or electricity. Safe to run again.
alter table owners add column if not exists meter_in jsonb;
alter table owners add column if not exists meter_out jsonb;
alter table charges add column if not exists prev_reading numeric;
alter table charges add column if not exists cur_reading numeric;
alter table payments add column if not exists for_what text;
alter table proofs add column if not exists for_what text;
alter table approvals drop constraint if exists approvals_kind_check;
alter table approvals add constraint approvals_kind_check check (kind in ('discount','generator','plan','rate','adjust','rates','rules','fine','announce','possession','instalments','due','posdate','reverse','discontinue','leave'));
