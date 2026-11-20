-- Customers, employees and flats (21 Nov 2026). Safe to run again.
--  · Customers: an ID per building (CC-00001…) and their CNIC details.
--  · Staff: an employee ID (EMP-0001…), phone and CNIC details.
--  · Each building's flats added by the Admin (Settings › Flats), for New possession's list of empty flats.
-- Run this BEFORE deploying update 124: the CRM saves these columns.

alter table owners add column if not exists customer_id text;
alter table owners add column if not exists cnic text;
alter table owners add column if not exists cnic_expiry date;
alter table owners add column if not exists cnic_address text;
create unique index if not exists owners_customer_id_key on owners (customer_id) where customer_id is not null;

alter table staff add column if not exists staff_no text;
alter table staff add column if not exists phone text;
alter table staff add column if not exists cnic text;
alter table staff add column if not exists cnic_expiry date;
alter table staff add column if not exists cnic_address text;
create unique index if not exists staff_staff_no_key on staff (staff_no) where staff_no is not null;

alter table project_settings add column if not exists flats jsonb not null default '[]';

-- IDs for the customers already in the CRM: per building, in the order they were added (the number at the end of
-- their record id), after any IDs already given.
with mx as (
  select project, coalesce(max(nullif(substring(customer_id from '(\d+)$'), '')::bigint), 0) as n from owners group by project
), r as (
  select o.id, o.project, row_number() over (partition by o.project order by nullif(substring(o.id from '(\d+)$'), '')::bigint nulls last, o.id) as n
  from owners o where o.customer_id is null
)
update owners o set customer_id = upper(o.project) || '-' || lpad((mx.n + r.n)::text, 5, '0')
from r join mx on mx.project = r.project where o.id = r.id;

-- Employee IDs for the staff already there, in the order they were added.
with mx as (select coalesce(max(nullif(substring(staff_no from '(\d+)$'), '')::bigint), 0) as n from staff),
r as (select id, row_number() over (order by created_at, id) as n from staff where staff_no is null)
update staff s set staff_no = 'EMP-' || lpad((mx.n + r.n)::text, 4, '0') from r, mx where s.id = r.id;
