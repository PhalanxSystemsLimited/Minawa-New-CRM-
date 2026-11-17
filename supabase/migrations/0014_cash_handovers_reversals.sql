-- Cash only (17 Nov 2026): reversing a wrong payment, a building manager cancelling a cash entry before it is
-- confirmed, and following cash from the building manager to the Accountant to the bank. Safe to run again.
alter table payments add column if not exists reversed jsonb;
alter table payments add column if not exists collector_id text;
alter table payments add column if not exists collector_name text;
alter table payments add column if not exists handover_id text;
alter table proofs drop constraint if exists proofs_status_check;
alter table proofs add constraint proofs_status_check check (status in ('pending','verified','rejected','cancelled'));
alter table approvals drop constraint if exists approvals_kind_check;
alter table approvals add constraint approvals_kind_check check (kind in ('discount','generator','plan','rate','adjust','rates','rules','fine','announce','possession','instalments','due','posdate','reverse'));

create table if not exists handovers (
  id text primary key,
  project text not null references projects(id),
  from_id text,
  from_name text not null default '',
  amount bigint not null default 0,
  payment_ids jsonb not null default '[]',
  d date not null,
  t text,
  status text not null default 'pending' check (status in ('pending','received','disputed')),
  received_by text,
  received_d date,
  note text,
  reply text,
  deposit_slip text,
  deposit_d date,
  deposited_by text
);
create index if not exists handovers_project on handovers(project);
alter table handovers enable row level security;
drop policy if exists staff_read on handovers;
create policy staff_read on handovers for select to authenticated using (is_staff());
