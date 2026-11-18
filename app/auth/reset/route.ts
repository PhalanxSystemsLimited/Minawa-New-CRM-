// Where the "reset your password" email link lands.
//  · ?token_hash=…&type=recovery (our email template, works on ANY device): the one-time token is not used here; it is
//    passed to /login/reset, and only used when the person submits the new password. So a link that an email
//    scanner or a phone's link preview opens first still works.
//  · ?code=… (Supabase's default template): only works in the browser that asked for the link. Kept as a fallback.
import { NextResponse } from 'next/server';
import { supabaseOn, supabaseServer } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url), code = u.searchParams.get('code'), hash = u.searchParams.get('token_hash');
  const fail = (m: string) => NextResponse.redirect(new URL('/login/forgot?e=' + encodeURIComponent(m), u.origin));
  if (!supabaseOn()) return fail('Local mode: nothing to reset.');
  if (hash) {
    if (!/^[A-Za-z0-9_-]{8,300}$/.test(hash)) return fail('That link is not complete. Ask for a new one.');
    return NextResponse.redirect(new URL('/login/reset?th=' + encodeURIComponent(hash), u.origin));
  }
  const sb = await supabaseServer();
  if (code) { const { error } = await sb.auth.exchangeCodeForSession(code); if (error) return fail('This reset link has expired or was opened in a different browser. Ask for a new one here, and open it on the same device.'); }
  else return fail(u.searchParams.get('error_description') || 'That link is not complete. Ask for a new one.');
  return NextResponse.redirect(new URL('/login/reset', u.origin));
}
