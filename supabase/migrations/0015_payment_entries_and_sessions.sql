-- 18 Nov 2026: payments entered as Cash or Bank transfer (transaction ID), who entered and who approved each payment,
-- and ending a staff member's sessions when the Admin changes their password or login. Safe to run again.
alter table payments add column if not exists entered_by text;
alter table payments add column if not exists approved_by text;
alter table payments add column if not exists approved_at text;
alter table payments add column if not exists txn text;
alter table proofs add column if not exists txn text;

-- Signs a staff member out on every device: removes their Supabase Auth sessions (and with them the refresh tokens).
-- Only the server (service_role) may call it.
create or replace function public.end_user_sessions(p_user uuid) returns integer
language plpgsql security definer set search_path = auth, public as $$
declare n integer;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.end_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.end_user_sessions(uuid) to service_role;
