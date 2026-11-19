-- Photos (21 Nov 2026): payment photos taken at entry (bank-transfer screen, bill receipt) and Oakwood electricity
-- bill photos. The pictures are in Cloudinary (private); this table keeps each photo's record and link. Staff open a
-- photo only through the CRM (checked against their buildings); nobody can list them. Safe to run again.
create table if not exists images (
  id text primary key,              -- IMG… (random)
  project text not null,
  owner_id text,
  kind text not null check (kind in ('payment', 'bill')),
  ref_id text,                      -- the payment or bill it belongs to
  url text not null,                -- the Cloudinary link (private, signed) or local:<file>
  public_id text not null,
  format text not null,
  bytes integer not null default 0,
  width integer not null default 0,
  height integer not null default 0,
  by_id text, by_name text,
  at timestamptz not null default now()
);
create index if not exists images_project_ref on images (project, ref_id);
alter table images enable row level security;   -- no policies: only the server (service role) reads or writes it

alter table bills add column if not exists photo_id text;
alter table payments add column if not exists photo_id text;
alter table payments add column if not exists bill_id text;
alter table proofs add column if not exists photo_id text;
alter table proofs add column if not exists bill_id text;
