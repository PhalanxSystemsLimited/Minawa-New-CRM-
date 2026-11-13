// Who is signed in. With Supabase: Supabase Auth (email + password) plus an active row in `staff`.
// Without Supabase (local mode): a simple cookie, with the two built-in local users.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { Staff } from './types';
import { getStore } from './store';

export const supabaseOn = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const LOCAL_COOKIE = 'minawa_local_user';

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: list => { try { list.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* called from a server component */ } }
    }
  });
}

export async function currentStaff(): Promise<Staff | null> {
  const store = await getStore();
  if (supabaseOn()) {
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    const staff = (await store.listStaff()).find(s => s.id === data.user!.id);
    return staff && staff.active ? staff : null;
  }
  const jar = await cookies();
  const id = jar.get(LOCAL_COOKIE)?.value;
  if (!id) return null;
  return (await store.listStaff()).find(s => s.id === id && s.active) || null;
}

export async function requireStaff(): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect('/login');
  return s;
}
export async function requireAdmin(): Promise<Staff> {
  const s = await requireStaff();
  if (s.role !== 'admin') throw new Error('Only admins (the CEO and directors) can do this.');
  return s;
}
export const roleName = (s: Staff) => s.role === 'admin' ? 'Admin' : 'Accountant';
/** The person's name, for "recorded by" on payments, notes and the activity log. */
export const staffName = (s: Staff) => s.name?.trim() || roleName(s);
