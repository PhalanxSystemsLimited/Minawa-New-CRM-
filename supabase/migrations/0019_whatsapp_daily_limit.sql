-- WhatsApp daily limit (20 Nov 2026). Each staff member's WhatsApp numbers (set by the Admin in Staff & connections),
-- every chat opened from the CRM (counted per sending number: different customers in any 24 hours), and the extra the
-- Admin allows for a number. The check-and-record step is one function, so two people sharing a number can't go over.
-- Safe to run again.
alter table staff add column if not exists wa_numbers jsonb;
alter table whatsapp_log add column if not exists from_number text;

create table if not exists wa_opens (
  id bigint generated always as identity primary key,
  number text not null,            -- the sending number (digits, e.g. 923001234567)
  to_phone text not null,          -- the customer's number (digits): each customer counts once in 24 hours
  staff_id text, staff_name text, project text, owner_id text,
  at timestamptz not null default now()
);
create index if not exists wa_opens_number_at on wa_opens (number, at desc);

create table if not exists wa_extras (
  id bigint generated always as identity primary key,
  number text not null, amount integer not null check (amount > 0),
  reason text not null, by_id text, by_name text,
  at timestamptz not null default now()
);
create index if not exists wa_extras_number_at on wa_extras (number, at desc);

alter table wa_opens enable row level security;
alter table wa_extras enable row level security;

-- Opening a chat: free if this customer was already counted on this number in the last 24 hours; otherwise counted if
-- the number is under its limit (plus any extra the Admin allowed in the last 24 hours). Returns the count, the limit and,
-- when full, when the next place frees up.
create or replace function public.wa_take(p_number text, p_limit integer, p_to text, p_staff_id text, p_staff_name text, p_project text, p_owner text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_used integer; v_extra integer; v_seen boolean; v_next timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('wa:' || p_number));
  select coalesce(sum(amount), 0) into v_extra from wa_extras where number = p_number and at > now() - interval '24 hours';
  select count(distinct to_phone) into v_used from wa_opens where number = p_number and at > now() - interval '24 hours';
  select exists (select 1 from wa_opens where number = p_number and to_phone = p_to and at > now() - interval '24 hours') into v_seen;
  if v_seen then
    return jsonb_build_object('ok', true, 'repeat', true, 'used', v_used, 'limit', p_limit + v_extra);
  end if;
  if v_used >= p_limit + v_extra then
    select min(f) + interval '24 hours' into v_next from (select min(at) as f from wa_opens where number = p_number and at > now() - interval '24 hours' group by to_phone) x;
    return jsonb_build_object('ok', false, 'repeat', false, 'used', v_used, 'limit', p_limit + v_extra, 'next_free', v_next);
  end if;
  insert into wa_opens (number, to_phone, staff_id, staff_name, project, owner_id) values (p_number, p_to, p_staff_id, p_staff_name, p_project, p_owner);
  return jsonb_build_object('ok', true, 'repeat', false, 'used', v_used + 1, 'limit', p_limit + v_extra);
end $$;
revoke all on function public.wa_take(text, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.wa_take(text, integer, text, text, text, text, text) to service_role;
