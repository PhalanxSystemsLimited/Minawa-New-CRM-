-- 0008 (13 Nov 2026): approvals for the whole project.
-- Accountants can now also change the monthly fees (rate card), the billing schedule and the fine, and send mass
-- announcements; each waits for an admin's approval. These requests aren't about one owner, so owner_id is empty.
-- Running this again changes nothing.
alter table approvals alter column owner_id drop not null;
alter table approvals drop constraint if exists approvals_kind_check;
alter table approvals add constraint approvals_kind_check
  check (kind in ('discount', 'generator', 'plan', 'rate', 'adjust', 'rates', 'rules', 'fine', 'announce'));

select 'APPROVALS|' || count(*) || '|' || count(*) filter (where status = 'pending') as r from approvals;
