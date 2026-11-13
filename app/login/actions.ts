'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { supabaseOn, supabaseServer, LOCAL_COOKIE } from '@/lib/session';
import { getStore } from '@/lib/store';
import { staffLog } from '@/lib/ops';
import { currentStaff } from '@/lib/session';

export async function signIn(fd: FormData) {
  const email = String(fd.get('email') || '').trim().toLowerCase(), password = String(fd.get('password') || '');
  if (supabaseOn()) {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.user) redirect('/login?e=' + encodeURIComponent('Wrong email or password.'));
    const staff = (await (await getStore()).listStaff()).find(s => s.id === data.user!.id);
    if (!staff || !staff.active) { await sb.auth.signOut(); redirect('/login?e=' + encodeURIComponent('This account has no access to the CRM. Ask an admin to add you.')); }
    await staffLog(staff!, `${staff!.name} signed in`, { kind: 'signin' });
    redirect('/');
  }
  // Local mode (no Supabase): the two built-in users, password from LOCAL_PASSWORD (default "minawa").
  const staff = (await (await getStore()).listStaff()).find(s => s.email === email && s.active);
  if (!staff || password !== (process.env.LOCAL_PASSWORD || 'minawa')) redirect('/login?e=' + encodeURIComponent('Wrong email or password.'));
  (await cookies()).set(LOCAL_COOKIE, staff!.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 12 });
  await staffLog(staff!, `${staff!.name} signed in`, { kind: 'signin' });
  redirect('/');
}

export async function signOut() {
  const me = await currentStaff();
  if (me) await staffLog(me, `${me.name} signed out`, { kind: 'signin' });
  if (supabaseOn()) { const sb = await supabaseServer(); await sb.auth.signOut(); }
  (await cookies()).delete(LOCAL_COOKIE);
  redirect('/login');
}
