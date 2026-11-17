// Where the "reset your password" email link lands. Supabase sends either a one-time code (?code=…, opened in the same
// browser that asked) or a token hash (?token_hash=…&type=recovery, if the email template uses it). Either way this
// signs the person in just long enough to choose a new password on /login/reset.
import { NextResponse } from 'next/server';
import { supabaseOn, supabaseServer } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url), code = u.searchParams.get('code'), hash = u.searchParams.get('token_hash');
  const fail = (m: string) => NextResponse.redirect(new URL('/login/forgot?e=' + encodeURIComponent(m), u.origin));
  if (!supabaseOn()) return fail('Local mode: nothing to reset.');
  const sb = await supabaseServer();
  if (code) { const { error } = await sb.auth.exchangeCodeForSession(code); if (error) return fail('This reset link has expired or was opened in a different browser. Ask for a new one here, and open it on the same device.'); }
  else if (hash) { const { error } = await sb.auth.verifyOtp({ token_hash: hash, type: 'recovery' }); if (error) return fail('This reset link has expired. Ask for a new one.'); }
  else return fail(u.searchParams.get('error_description') || 'That link is not complete. Ask for a new one.');
  return NextResponse.redirect(new URL('/login/reset', u.origin));
}
