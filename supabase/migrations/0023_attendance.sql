-- Attendance (23 Nov 2026). New tables only: nothing existing is changed. Safe to run again.
--  · employees: everyone whose attendance is kept (field staff, and building managers / accountants linked to their
--    login), with their working hours, buildings, personal attendance link (token) and registered phone (device).
--  · attendance: one row per employee per day (check-in and check-out with where they were, or marked by a manager).
--  · att_requests: "Ask manager" requests after a refused check-in or check-out.
--  · att_pings / att_alerts: the Android app's location during working hours, and the alerts it raises (left the
--    area, back, location off). Used from the Android app's update on.
-- Only the server (service role) reads or writes these: row level security on, no policies.

create table if not exists employees (
  id text primary key,                      -- EM1, EM2…
  emp_no text not null,                     -- EMP-0001 (shared with staff logins' employee IDs)
  name text not null,
  father_name text,
  phone text not null default '',
  cnic text,
  designation text not null default '',
  projects jsonb not null default '[]',     -- the buildings (project ids) they work at and may check in at
  staff_id text,                            -- their CRM login (building managers, accountants); null for field staff
  shift_start text not null default '09:00',
  shift_end text not null default '17:00',
  off_days jsonb not null default '[0]',    -- weekly off days, 0 = Sunday
  active boolean not null default true,
  joined date,
  left_on date,
  token text not null,                      -- the personal attendance link's code
  device jsonb,                             -- the registered phone (passkey or app key), pending until approved
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists employees_emp_no_key on employees (emp_no);
create unique index if not exists employees_token_key on employees (token);
create index if not exists employees_staff_id on employees (staff_id);
alter table employees enable row level security;

create table if not exists attendance (
  id text primary key,                      -- <employee id>:<date>
  employee_id text not null references employees (id) on delete cascade,
  project text not null,                    -- the building where they checked in (or were marked)
  d date not null,                          -- the working day (a night shift counts on the day it starts)
  status text not null check (status in ('present', 'late', 'absent', 'leave', 'off', 'half')),
  in_at text,                               -- 'YYYY-MM-DD HH:MM', Pakistan time
  out_at text,
  in_place jsonb,                           -- { lat, lng, acc, dist } at check-in
  out_place jsonb,
  how text not null default 'fingerprint' check (how in ('fingerprint', 'app', 'manager')),
  by_name text,
  note text,
  updated_at timestamptz not null default now()
);
create index if not exists attendance_d on attendance (d);
create index if not exists attendance_emp_d on attendance (employee_id, d);
alter table attendance enable row level security;

create table if not exists att_requests (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  project text not null,
  d date not null,
  t text not null,                          -- 'HH:MM'
  kind text not null check (kind in ('checkin', 'checkout')),
  reason text not null default '',
  place jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'refused')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists att_requests_status on att_requests (status, d);
alter table att_requests enable row level security;

create table if not exists att_pings (
  n bigint generated always as identity primary key,
  employee_id text not null references employees (id) on delete cascade,
  project text,
  at timestamptz not null,
  lat double precision not null,
  lng double precision not null,
  acc real,
  dist integer,                             -- metres from the nearest office point
  inside boolean
);
create index if not exists att_pings_emp_at on att_pings (employee_id, at desc);
alter table att_pings enable row level security;

create table if not exists att_alerts (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  project text not null,
  d date not null,
  at timestamptz not null default now(),
  kind text not null,                       -- left, back, signal_lost, early_out
  text text not null default '',
  place jsonb
);
create index if not exists att_alerts_d on att_alerts (d);
alter table att_alerts enable row level security;
