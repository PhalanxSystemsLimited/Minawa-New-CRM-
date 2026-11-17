-- No online payments (Safepay removed): payments are entered by hand. A building manager's entry (proofs.kind 'cash')
-- now says how it was paid: Cash, Bank transfer or Cheque. Safe to run again.
alter table proofs add column if not exists method text;
-- The old payment-link table is no longer used by the CRM; its rows are kept as history.
