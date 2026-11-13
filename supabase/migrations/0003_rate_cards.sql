-- Minawa's 2026 rate cards (monthly), from the "Maintenance Charges Year 2026" sheets (02.09.26).
-- Admins change rates later in each project's Settings › Monthly fees; a new row with a later from_ date takes over from that date.
insert into rates (id, project, type, from_, amount) values
  -- Country Club Apartments, Murree. Yearly: 72,000 / 96,000 / 108,000 / 120,000.
  ('cc:1-Bed:2026-01-01',        'cc', '1-Bed',        '2026-01-01',  6000),
  ('cc:2-Bed:2026-01-01',        'cc', '2-Bed',        '2026-01-01',  8000),
  ('cc:3-Bed:2026-01-01',        'cc', '3-Bed',        '2026-01-01',  9000),
  ('cc:3-Bed (D/L):2026-01-01',  'cc', '3-Bed (D/L)',  '2026-01-01', 10000),   -- "4-Bed (D/L)" on the rate card
  -- Oakwood Apartments & Cottages, Bhurban. Yearly: 60,000 / 72,000 / 96,000.
  ('ow:1-Bed:2026-01-01',        'ow', '1-Bed',        '2026-01-01',  5000),
  ('ow:2-Bed:2026-01-01',        'ow', '2-Bed',        '2026-01-01',  6000),
  ('ow:Cottage:2026-01-01',      'ow', 'Cottage',      '2026-01-01',  8000),
  -- The Royal Enclave, Islamabad. Yearly: 144,000. Flats charged differently on the sheet keep their own rate.
  ('re:Apartment:2026-01-01',    're', 'Apartment',    '2026-01-01', 12000)
on conflict (id) do update set amount = excluded.amount;

-- Billing schedule per project: bills in advance on the 25th at 11:00, due 15 days later, reminders 7 and 3 days
-- before, 10% fine the day after the due date, flag 15 days after. Electricity is entered for Country Club and Oakwood.
insert into project_settings (project, rules) values
  ('cc', '{"billDay":25,"dueDays":15,"remindDays":[7,3],"feePct":10,"flagDays":15,"autoSend":true,"sendHour":11,"utilities":["Electricity"]}'),
  ('ow', '{"billDay":25,"dueDays":15,"remindDays":[7,3],"feePct":10,"flagDays":15,"autoSend":true,"sendHour":11,"utilities":["Electricity"]}'),
  ('re', '{"billDay":25,"dueDays":15,"remindDays":[7,3],"feePct":10,"flagDays":15,"autoSend":true,"sendHour":11,"utilities":[]}')
on conflict (project) do nothing;
