-- The months a payment is for (26 Nov 2026), picked by the building manager when he enters it; shown on the receipt
-- and in its WhatsApp message. New columns only. Safe to run again.
alter table payments add column if not exists period_from text;
alter table payments add column if not exists period_to text;
alter table proofs add column if not exists period_from text;
alter table proofs add column if not exists period_to text;
