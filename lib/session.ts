// Who is signed in. With Supabase: Supabase Auth (email + password) plus an active row in `staff`.
// Without Supabase (local mode): a simple cookie, with the two built-in local users.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { Staff } from './types';
import { getStore } from './store';
import { scoped } from './people';

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
    const all = await store.listStaff(), staff = all.find(s => s.id === data.user!.id);
    return staff && staff.active ? scoped(staff, all) : null;
  }
  const jar = await cookies();
  const id = jar.get(LOCAL_COOKIE)?.value;
  if (!id) return null;
  const all = await store.listStaff(), me = all.find(s => s.id === id && s.active);
  return me ? scoped(me, all) : null;
}



export async function requireStaff(): Promise<Staff> {
  const s = await currentStaff();
  if (!s) redirect('/login');
  return s;
}
export async function requireAdmin(): Promise<Staff> {
  const s = await requireStaff();
  if (s.role !== 'admin') redirect('/?flash=' + encodeURIComponent('Only an Admin (the owner or a director) can do that.'));
  return s;
}
export const ROLE_NAMES: Record<Staff['role'], string> = { admin: 'Admin', accountant: 'Accountant', manager: 'Building manager' };
export const roleName = (s: Staff) => ROLE_NAMES[s.role] || 'Accountant';
/** Which buildings someone may open: Admins all of them; a Building manager only those assigned; an Accountant those
 *  assigned, or all of them while the Admin has ticked none (18 Nov 2026). */
export const canOpen = (s: Staff | null | undefined, pid: string) => !s || s.role === 'admin' || (s.projects || []).includes(pid) || (s.role === 'accountant' && !(s.projects || []).length);
export async function requireRole(...roles: Staff['role'][]): Promise<Staff> {
  const s = await requireStaff();
  if (!roles.includes(s.role)) redirect('/?flash=' + encodeURIComponent('That page isn\'t part of your role.'));
  return s;
}
/** The person's name, for "recorded by" on payments, notes and the activity log. */
export const staffName = (s: Staff) => s.name?.trim() || roleName(s);
