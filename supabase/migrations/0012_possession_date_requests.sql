-- A changed possession date moves the customer's billing date, so a building manager's or accountant's change waits
-- for the Admin (approval kind 'posdate'). Safe to run again.
alter table approvals drop constraint if exists approvals_kind_check;
alter table approvals add constraint approvals_kind_check check (kind in ('discount','generator','plan','rate','adjust','rates','rules','fine','announce','possession','instalments','due','posdate'));
