-- 0006 (13 Nov 2026): Generator Charges List.
-- A flat on the list is billed on the "<type> + generator" rate card. Royal Enclave: Apartment 12,000 a month,
-- Apartment + generator 15,000. Bills keep the amount they were made with, so changing the list only affects later bills.
alter table owners add column if not exists generator boolean not null default false;

insert into rates (id, project, type, from_, amount)
values ('re:Apartment + generator:2026-01-01', 're', 'Apartment + generator', '2026-01-01', 15000)
on conflict (id) do nothing;

-- Royal Enclave's 16 flats already billed 15,000 (1,80,000 a year on the sheet; 16A-14, 16B-25 and 16B-33 at 3,40,000;
-- 16B-22 at 1,85,000) start on the list and use the generator rate card instead of an own rate. Their amount stays
-- 15,000. The 6 flats at 9,000 keep their own agreed rate. Running this again changes nothing.
update owners
set generator = true, rate = null,
    notes = notes || jsonb_build_array(jsonb_build_object('d', '2026-11-13', 'by', 'Setup', 'text',
      'On the Generator Charges List: Rs 15,000 a month on the generator rate card (it was billed Rs 15,000 as its own rate; the amount does not change).'))
where project = 're' and status = 'active' and rate = 15000 and not generator;

insert into activity_log (id, project, d, t, kind, text)
select 'Lgenerator-re-20261113', 're', '2026-11-13', '12:00', 'job',
  'Generator Charges List set up: ' || count(*) filter (where generator) || ' flats with generator at Rs 15,000 a month, '
  || count(*) filter (where not generator and rate is null and not exempt) || ' at Rs 12,000, '
  || count(*) filter (where rate is not null and not exempt) || ' on their own agreed rate. Changes to the list count from each flat''s next bill.'
from owners where project = 're' and status = 'active'
on conflict (id) do nothing;

select 'GEN|' || count(*) filter (where generator) || '|' || count(*) filter (where rate = 15000) || '|' || count(*) filter (where rate = 9000)
  || '|' || (select count(*) from rates where project = 're') || '|' || (select count(*) from bills where project = 're') as r
from owners where project = 're';
