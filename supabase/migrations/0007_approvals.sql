-- 0007 (13 Nov 2026): approvals.
-- When an accountant changes what an owner is charged (a discount, the Generator Charges List, the billing plan, the
-- flat's own monthly fee, or an adjustment: an extra charge or a credit/waiver), the change waits here until an admin
-- approves or rejects it. It is only made when approved. Admins' own changes apply straight away.
-- Running this again changes nothing.
create table if not exists approvals (
  id text primary key,
  project text not null references projects(id),
  owner_id text not null references owners(id),
  kind text not null check (kind in ('discount', 'generator', 'plan', 'rate', 'adjust')),
  change jsonb not null default '{}'::jsonb,          -- what to change, e.g. {"kind":"pct","value":10,"until":null}
  summary text not null default '',                   -- what it will be ("10% off the monthly fee")
  before_ text not null default '',                   -- what it was when asked ("No discount")
  note text not null default '',                      -- the accountant's reason
  by_id uuid,
  by_name text not null default '',
  d date not null,
  t text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  decided_by_id uuid,
  decided_by_name text,
  decided_d date,
  decided_t text,
  reply text,
  created_at timestamptz not null default now()
);
create index if not exists approvals_project_status on approvals(project, status);
create index if not exists approvals_owner on approvals(owner_id);

alter table approvals enable row level security;
drop policy if exists staff_read on approvals;
create policy staff_read on approvals for select to authenticated using (is_staff());

select 'APPROVALS|' || count(*) as r from approvals;
