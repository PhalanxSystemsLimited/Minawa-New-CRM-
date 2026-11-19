-- Instant receipts (19 Nov 2026): a building manager's payment entry is recorded as a payment at once, with its receipt
-- to send; the Accountant's approval only confirms the money reached him. Links an entry and its payment both ways,
-- and marks the building manager's follow-up when an entry is not received. Safe to run again.
alter table payments add column if not exists entry_id text;
alter table proofs add column if not exists pay_id text;
alter table alerts add column if not exists kind text;
