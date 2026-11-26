-- 0029 (26 Nov 2026): approvals for an apartment's type ('apttype': an accountant's change waits for the Admin), and
-- 'elecfine' (electricity late fine), which the check constraint never listed.
do $$ begin
  alter table approvals drop constraint if exists approvals_kind_check;
  alter table approvals add constraint approvals_kind_check check (kind in ('discount','generator','plan','rate','adjust','rates','rules','fine','announce','possession','instalments','due','posdate','reverse','discontinue','leave','elecfine','apttype'));
end $$;
