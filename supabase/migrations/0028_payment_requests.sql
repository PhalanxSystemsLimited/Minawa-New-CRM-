-- Payment requests (26 Nov 2026): the accountant asks a building manager to collect an amount from a customer (cash
-- or bank transfer, for the months given); the building manager answers with an entry (proofs.request_id). New table
-- and column only. Safe to run again.
create table if not exists requests (
  id text primary key,
  project text not null references projects(id),
  owner_id text not null references owners(id),
  amount numeric not null,
  method text not null check (method in ('Cash', 'Bank transfer')),
  period_from text not null,
  period_to text not null,
  for_what text,
  note text,
  manager_id text not null,
  manager_name text not null default '',
  by_id text,
  by_name text not null default '',
  d date not null,
  t text not null,
  status text not null default 'open' check (status in ('open', 'entered', 'cancelled')),
  proof_id text,
  done_d date,
  done_t text,
  reply text,
  created_at timestamptz not null default now()
);
create index if not exists requests_project_status on requests(project, status);
create index if not exists requests_manager on requests(manager_id, status);
alter table requests enable row level security;
drop policy if exists staff_read on requests;
create policy staff_read on requests for select to authenticated using (is_staff());

alter table proofs add column if not exists request_id text;
