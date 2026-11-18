'use server';
// Passwords (17 Nov 2026): change your own password (signed in), and "Forgot password?" on the sign-in page, which
// emails a reset link through Supabase Auth. In local mode (no Supabase) there is one shared test password, so these
// only explain that. An Admin can still set anyone's password in Staff & connections → Edit.
import { redirect } from 'next/navigation';
import { requireStaff, supabaseOn, supabaseServer, staffName } from './session';
import { staffLog } from './ops';
import { siteOrigin } from './doclink';
import { getStore } from './store';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const go = (path: string, key: 'e' | 'ok' | 't', msg: string): never => redirect(path + (path.includes('?') ? '&' : '?') + key + '=' + encodeURIComponent(msg));
const MIN = 8;
function weak(pw: string, again: string) {
  if (pw.length < MIN) return `Use at least ${MIN} characters.`;
  if (pw !== again) return 'The two new passwords are not the same.';
  if (/^(.)\1*$/.test(pw) || /^(12345678|password|minawa123|qwerty12)/i.test(pw)) return 'That password is too easy to guess.';
  return null;
}

/** Change your own password: checks the current one first. */
export async function changePasswordAction(fd: FormData) {
  const me = await requireStaff(), cur = S(fd, 'current'), pw = S(fd, 'password'), again = S(fd, 'again');
  if (!supabaseOn()) go('/account', 'e', 'Local mode: everyone uses the test password set on the server (LOCAL_PASSWORD). Nothing to change here.');
  const bad = weak(pw, again); if (bad) go('/account', 'e', bad);
  if (pw === cur) go('/account', 'e', 'The new password is the same as the current one.');
  const { createClient } = await import('@supabase/supabase-js');
  // A separate client that keeps nothing: only to check the current password, without touching this browser's sign-in.
  const check = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: me.email, password: cur });
  if (wrong) go('/account', 'e', 'Your current password is not right.');
  await check.auth.signOut().catch(() => {});
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
  const { error } = await admin.updateUserById(me.id, { password: pw });
  if (error) go('/account', 'e', error.message);
  await staffLog(me, `${staffName(me)} changed their password`, { kind: 'admin' });
  go('/account', 'ok', 'Password changed. Use the new one next time you sign in.');
}

/** "Forgot password?": emails a reset link. The answer is the same whether or not the email has an account. */
export async function forgotAction(fd: FormData) {
  const email = S(fd, 'email').trim().toLowerCase();
  if (!supabaseOn()) go('/login/forgot', 'e', 'Local mode: there is no email sign-in. Use the test password, or ask the Admin.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go('/login/forgot', 'e', 'Enter the email you sign in with.');
  const sb = await supabaseServer();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${await siteOrigin()}/auth/reset` });
  if (error && /rate|limit|seconds/i.test(error.message)) go('/login/forgot', 'e', 'Too many tries. Wait a minute and try again.');
  go('/login/forgot', 'ok', `If ${email} has a CRM account, a reset link is on its way. It works once, on any phone or computer, for one hour.`);
}

/** The page the reset link leads to: sets the new password, then signs out so you sign in with it. */
export async function resetAction(fd: FormData) {
  if (!supabaseOn()) go('/login', 'e', 'Local mode: nothing to reset.');
  const th = S(fd, 'th').trim(), back = th ? `/login/reset?th=${encodeURIComponent(th)}` : '/login/reset';
  const pw = S(fd, 'password'), bad = weak(pw, S(fd, 'again'));
  if (bad) go(back, 'e', bad);
  const sb = await supabaseServer();
  if (th) {
    // The token in the link is what says which account this is: Supabase finds the account it was made for, checks it
    // is unused and not expired, and signs in as that account for this request only. It can't be used again.
    const { error } = await sb.auth.verifyOtp({ token_hash: th, type: 'recovery' });
    if (error) go('/login/forgot', 'e', 'This reset link has expired or was already used. Ask for a new one.');
  }
  const { data } = await sb.auth.getUser();
  if (!data.user) go('/login/forgot', 'e', 'The reset link has expired. Ask for a new one.');
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) go('/login/reset', 'e', error.message);
  const st = (await (await getStore()).listStaff().catch(() => [])).find(x => x.id === data.user!.id);
  if (st) await staffLog(st, `${staffName(st)} reset their password from the email link`, { kind: 'admin' });
  await sb.auth.signOut();
  go('/login', 'ok', 'Password changed. Sign in with the new password.');
}
