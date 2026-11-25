'use server';
// Past employees (24 Nov 2026). The Admin deletes an employee on Staff & connections: they move to Past employees with
// their last working day, why they left and who recorded it. Nothing is removed: their activity and everything they
// entered stays. Their login is turned off and every open sign-in ended, so they can't sign in again. The Admin can
// bring them back if they rejoin (same email and password).
import { redirect } from 'next/navigation';
import { requireAdmin, staffName } from './session';
import { getStore } from './store';
import { staffLog } from './ops';
import { LEAVE_REASONS, reportsToAcc, withoutAcc } from './people';
import { addDays, fd, todayPKT } from './fmt';

const S = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const back = (msg: string, q = ''): never => redirect(`/admin?${q}${q ? '&' : ''}t=${encodeURIComponent(msg)}`);

/** Ends every sign-in session of a login (migration 0015's end_user_sessions; service role only). */
async function endSessions(id: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.rpc('end_user_sessions', { p_user: id });
    if (error) { console.error('end sessions', error.message); return false; }
    return true;
  } catch (e) { console.error('end sessions', (e as Error).message); return false; }
}

export async function deleteStaffAction(f: FormData) {
  const me = await requireAdmin(), store = await getStore(), id = S(f, 'id'), today = todayPKT();
  const leftOn = /^\d{4}-\d{2}-\d{2}$/.test(S(f, 'leftOn')) ? S(f, 'leftOn') : today, reason = LEAVE_REASONS.includes(S(f, 'reason')) ? S(f, 'reason') : '', note = S(f, 'note').slice(0, 200);
  const again = `m=delete${id ? `&id=${encodeURIComponent(id)}` : ''}`;
  if (!id) back('Not deleted: choose the employee', again);
  if (!reason) back('Not deleted: choose why they left', again);
  if (leftOn > today || leftOn < addDays(today, -366)) back('Not deleted: the last working day must be in the past year, not in the future', again);
  if (S(f, 'confirm') !== 'on') back('Not deleted: tick the box to confirm', again);
  const staff = await store.listStaff(), st = staff.find(x => x.id === id);
  if (!st) back('Not deleted: that employee is not on file');
  if (st!.id === me.id) back('Not deleted: you can\'t delete yourself');
  if (st!.leftOn) back(`${st!.name} is already a past employee`);
  if (st!.role === 'admin' && !staff.some(x => x.role === 'admin' && x.active && !x.leftOn && x.id !== st!.id)) back('Not deleted: keep at least one Admin who can sign in');
  const who = staffName(me), why = `${reason}${note ? `: ${note}` : ''}`;
  await store.saveStaff({ ...st!, active: false, leftOn, leftReason: why, leftBy: who });
  // A past accountant's building managers report to no one until the Admin picks another accountant.
  for (const x of staff) if (reportsToAcc(x, st!.id)) await store.saveStaff(withoutAcc(x, st!.id));
  const ended = await endSessions(st!.id);
  await staffLog(me, `${st!.name} (${st!.email}) deleted by ${who}: moved to past employees, last working day ${fd(leftOn)}, ${why}. Sign-in turned off.`, { kind: 'admin' });
  back(`${st!.name} moved to Past employees. Their login is turned off${ended ? ' and signed out everywhere' : ' (they lose access on their next click)'}.`, 'v=past');
}

export async function restoreStaffAction(f: FormData) {
  const me = await requireAdmin(), store = await getStore(), id = S(f, 'id');
  const st = (await store.listStaff()).find(x => x.id === id);
  if (!st || !st.leftOn) back('Not saved: that past employee is not on file');
  await store.saveStaff({ ...st!, active: true, leftOn: null, leftReason: null, leftBy: null });
  await staffLog(me, `${st!.name} (${st!.email}) brought back from past employees by ${staffName(me)}. Sign-in turned on.`, { kind: 'admin' });
  back(`${st!.name} is working again and can sign in with their old email and password.`);
}
