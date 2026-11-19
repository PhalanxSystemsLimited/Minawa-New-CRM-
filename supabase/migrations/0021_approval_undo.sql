-- Undo an approved change (21 Nov 2026): what a rate, rate-card, discount or plan change replaced, so the Admin can
-- put it back within 7 days if no bill has used it yet. Safe to run again.
alter table approvals add column if not exists undo jsonb;
