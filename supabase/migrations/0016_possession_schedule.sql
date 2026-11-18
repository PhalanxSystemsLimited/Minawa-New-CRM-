-- Phase 2 (18 Nov 2026): possession-day billing. Bills record the days they cover; the 6-monthly plan; a building
-- manager's request to discontinue (or resume) maintenance. Safe to run again.
alter table bills add column if not exists cov_from date;
alter table bills add column if not exists cov_to date;
alter table owners drop constraint if exists owners_plan_check;
alter table owners add constraint owners_plan_check check (plan in ('monthly','quarterly','sixmonthly','annual'));
alter table approvals drop constraint if exists approvals_kind_check;
alter table approvals add constraint approvals_kind_check check (kind in ('discount','generator','plan','rate','adjust','rates','rules','fine','announce','possession','instalments','due','posdate','reverse','discontinue'));
