-- Minawa CRM: maintenance billing schema.
-- Column names are the snake_case of the app's field names (see lib/store/tables.ts).
-- All writes go through the server (service role). Signed-in staff can read; nobody writes from the browser.

create table if not exists projects (
  id text primary key,
  name text not null,
  place text not null default '',
  kind text not null default '',
  live boolean not null default false,
  go_live date,
  bank text not null default '',
  sort int not null default 0
);

-- Minawa's company details, printed on every bill, statement and receipt (one row).
create table if not exists company (
  id int primary key default 1 check (id = 1),
  legal_name text not null default 'Minawa (Pvt) Ltd',
  address text not null default '',
  ntn text not null default '',
  phone text not null default '',
  email text not null default ''
);
insert into company(id) values (1) on conflict (id) do nothing;

create table if not exists staff (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null check (role in ('admin','accountant')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists rates (
  id text primary key,
  project text not null references projects(id),
  type text not null,
  from_ date not null,
  amount numeric not null,
  unique (project, type, from_)
);

create table if not exists owners (
  id text primary key,
  project text not null references projects(id),
  unit text not null,
  apt text not null,
  block text not null default '',
  type text not null default '',
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  possession date not null,
  possession_known boolean not null default true,
  opening numeric not null default 0,
  opening_left numeric not null default 0,
  credit numeric not null default 0,
  fee_due numeric not null default 0,
  exempt boolean not null default false,
  exempt_why text,
  director boolean not null default false,
  discount jsonb,
  abroad boolean not null default false,
  invalid_phone boolean not null default false,
  no_phone boolean not null default false,
  rate numeric,
  status text not null default 'active' check (status in ('active','closed')),
  closed_on date,
  flagged boolean not null default false,
  flagged_on date,
  promise_until date,
  notes jsonb not null default '[]',
  suspensions jsonb not null default '[]',
  prev_owner_id text,
  plan text not null default 'monthly' check (plan in ('monthly','quarterly','annual')),
  floor text not null default ''
);
create index if not exists owners_project on owners(project);
create index if not exists owners_phone on owners(phone);

create table if not exists bills (
  id text primary key,
  owner_id text not null references owners(id),
  project text not null references projects(id),
  period text not null,
  period_end text not null,
  months int not null default 1,
  bill_date date not null,
  due_date date not null,
  final_date date not null,
  amount numeric not null,
  discount numeric not null default 0,
  extras numeric not null default 0,
  net numeric not null,
  paid numeric not null default 0,
  fine numeric not null default 0,
  fine_paid numeric not null default 0,
  fined boolean not null default false,
  from_credit numeric not null default 0,
  prev numeric not null default 0,
  notice_skipped boolean not null default false,
  flag_skipped boolean not null default false,
  reminders jsonb not null default '[]',
  lines jsonb not null default '[]',
  bd jsonb
);
create index if not exists bills_project on bills(project);
create index if not exists bills_owner on bills(owner_id);

create table if not exists entries (
  id text primary key,
  owner_id text not null references owners(id),
  project text not null references projects(id),
  d date not null,
  kind text not null,
  amount numeric not null,
  description text not null,
  ref text,
  pid text
);
create index if not exists entries_project on entries(project);
create index if not exists entries_owner on entries(owner_id);

create table if not exists links (
  id text primary key,
  owner_id text not null references owners(id),
  project text not null references projects(id),
  amount numeric not null,
  status text not null check (status in ('active','paid','cancelled')),
  created date not null,
  cancelled_on date,
  paid_on date,
  sp jsonb,
  sp_settled boolean not null default false,
  sp_error text
);
create index if not exists links_project on links(project);
create index if not exists links_sp on links((sp->>'id'));

create table if not exists messages (
  id text primary key,
  owner_id text not null references owners(id),
  project text not null references projects(id),
  d date not null,
  t text not null,
  from_ text not null default 'biz',
  kind text not null,
  title text not null,
  text text not null,
  tpl text,
  vars jsonb,
  link_id text,
  pdf jsonb,
  status text not null,
  wa_id text,
  error text,
  manual boolean not null default false,
  shot boolean not null default false,
  sent_at timestamptz
);
create index if not exists messages_project on messages(project);
create index if not exists messages_wa on messages(wa_id);
create index if not exists messages_queued on messages(status) where status = 'queued';

create table if not exists payments (
  id text primary key,
  owner_id text not null references owners(id),
  project text not null references projects(id),
  d date not null,
  t text not null,
  amount numeric not null,
  method text not null,
  ref text not null,
  source text not null check (source in ('link','staff','proof')),
  by_ text not null,
  before_ numeric not null,
  applied jsonb not null default '[]',
  bal_after numeric not null,
  receipt text not null unique,
  gateway text,
  gw_mode text,
  link_id text,
  sp_link text,
  sp_tracker text
);
create index if not exists payments_project on payments(project);

create table if not exists proofs (
  id text primary key,
  owner_id text not null references owners(id),
  project text not null references projects(id),
  d date not null,
  t text not null,
  amount numeric not null,
  status text not null check (status in ('pending','verified','rejected')),
  msg_id text,
  done_on date,
  media text
);

create table if not exists alerts (
  id text primary key,
  owner_id text not null references owners(id),
  project text not null references projects(id),
  d date not null,
  text text not null,
  done boolean not null default false
);

create table if not exists clearances (
  no text primary key,
  owner_id text not null references owners(id),
  project text not null references projects(id),
  d date not null,
  by_ text not null
);

-- Utility bills (electricity…) entered by the accountant per flat and month; billed on the next bill day.
create table if not exists charges (
  id text primary key,
  owner_id text not null references owners(id),
  project text not null references projects(id),
  period text not null,
  kind text not null,
  amount numeric not null,
  units numeric,
  note text not null default '',
  by_ text not null,
  d date not null,
  bill_id text
);
create index if not exists charges_project on charges(project, period);

-- Maintenance notices sent by staff (water outage, electricity, lift…).
create table if not exists notices (
  id text primary key,
  project text not null references projects(id),
  d date not null,
  t text not null,
  kind text not null,
  title text not null,
  text text not null,
  audience text not null,
  count int not null default 0,
  failed int not null default 0,
  by_ text not null
);

create table if not exists templates (
  key text primary key,
  label text not null,
  status text not null,
  text text not null,
  pending text,
  submitted_on date,
  meta_name text not null
);

create table if not exists project_settings (
  project text primary key references projects(id),
  rules jsonb not null,
  tg_inc jsonb not null default '{"disc":[],"exempt":[]}',
  targets jsonb not null default '{}',
  last_run date
);

create table if not exists counters (
  k text primary key,
  n bigint not null
);

create table if not exists activity_log (
  n bigserial,
  id text primary key,
  project text,
  d date not null,
  t text not null,
  kind text not null,
  text text not null,
  owner_id text,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_project on activity_log(project, n desc);

-- One writer at a time: a lease that expires, so a crashed run never blocks the next one.
create table if not exists locks (
  name text primary key,
  holder text not null,
  until timestamptz not null
);
create or replace function acquire_lock(p_name text, p_holder text, p_ttl int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into locks(name, holder, until) values (p_name, p_holder, now() + make_interval(secs => p_ttl))
  on conflict (name) do update set holder = excluded.holder, until = excluded.until
    where locks.until < now() or locks.holder = excluded.holder;
  return exists (select 1 from locks where name = p_name and holder = p_holder);
end $$;
create or replace function release_lock(p_name text, p_holder text) returns void
language sql security definer set search_path = public as $$
  delete from locks where name = p_name and holder = p_holder;
$$;
revoke execute on function acquire_lock(text, text, int) from public, anon, authenticated;
revoke execute on function release_lock(text, text) from public, anon, authenticated;

-- Row level security: staff (an active row in `staff`) can read everything; writes only with the service role.
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active);
$$;

do $$
declare t text;
begin
  foreach t in array array['company','projects','staff','rates','owners','bills','entries','links','messages','payments','proofs','alerts','clearances','charges','notices',
                           'templates','project_settings','counters','activity_log','locks']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_read on %I', t);
    if t not in ('locks','counters') then
      execute format('create policy staff_read on %I for select to authenticated using (is_staff())', t);
    end if;
  end loop;
end $$;

-- Seed the seven projects (no owners yet).
insert into projects(id, name, place, kind, sort) values
  ('pt','Park Towers','Islamabad','Residential tower',1),
  ('re','The Royal Enclave','Islamabad','Residential enclave',2),
  ('cl','Clara Apartments','Islamabad','Apartments',3),
  ('cc','Country Club Apartments','Murree','Apartments',4),
  ('ow','Oakwood Apartments & Cottages','Bhurban','Apartments and cottages',5),
  ('tx','Taxila Satellite Township','Taxila','Township',6),
  ('wg','Wakefield Gardens','Khanpur','Garden homes',7)
on conflict (id) do nothing;
