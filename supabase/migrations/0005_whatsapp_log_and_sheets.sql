-- 0005 (12 Nov 2026)
-- 1) whatsapp_log: every WhatsApp message staff sent by hand from the CRM (WhatsApp Web), as confirmed when they came
--    back ("Did you send the message?"), and every chat they opened but did not send: who, to whom (owner and number),
--    when, what it said, the balance at the time.
-- 2) owners.sheet: each flat's line on the office's 2026 sheet (arrears, the year's charges, received, balance), for the
--    paid / due figures on the dashboards.
alter table owners add column if not exists sheet jsonb;

create table if not exists whatsapp_log (
  n bigserial,
  id text primary key,
  project text not null references projects(id),
  owner_id text references owners(id),
  apt text not null default '',
  owner_name text not null default '',
  block text not null default '',
  phone text not null default '',          -- the owner's number on file
  sent_to text not null default '',        -- the number the chat opened with (the test number while testing)
  answer text not null check (answer in ('sent', 'not_sent')),
  via text not null default 'prompt' check (via in ('prompt', 'button')),
  message_id text,                         -- the message on the owner's history (when sent)
  kind text not null default '',
  title text not null default '',
  text text not null default '',
  amount numeric not null default 0,       -- the owner's balance at the time
  link_id text,
  pay_url text,
  staff_id uuid,
  staff_name text not null default '',
  staff_role text not null default '',
  d date not null,
  t text not null,
  at timestamptz not null default now(),
  test boolean not null default false
);
create index if not exists whatsapp_log_project on whatsapp_log(project, n desc);
create index if not exists whatsapp_log_staff on whatsapp_log(staff_id, n desc);
create index if not exists whatsapp_log_owner on whatsapp_log(owner_id, n desc);
create index if not exists whatsapp_log_day on whatsapp_log(d desc);

alter table whatsapp_log enable row level security;
drop policy if exists staff_read on whatsapp_log;
create policy staff_read on whatsapp_log for select to authenticated using (is_staff());
