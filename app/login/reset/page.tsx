// Choose a new password, after opening the reset link from the email. With ?th= (the link's one-time token, any device)
// the token is only used when the form is submitted; without it, app/auth/reset already signed you in (same browser).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { resetAction } from '@/lib/actions-password';
import { supabaseOn, supabaseServer } from '@/lib/session';
import { Submit, PasswordInput } from '@/components/client';
import { ThemeSwitch } from '@/components/Shell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { referrer: 'no-referrer', robots: { index: false } };

export default async function Reset({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string; th?: string }> }) {
  const { e, ok } = await searchParams, th = /^[A-Za-z0-9_-]{8,300}$/.test((await searchParams).th || '') ? (await searchParams).th! : '';
  if (!supabaseOn()) redirect('/login');
  const { data } = th ? { data: { user: null } } : await (await supabaseServer()).auth.getUser();
  if (!th && !data.user) redirect('/login/forgot?e=' + encodeURIComponent('Open the reset link from your email first (it works once, for one hour).'));
  return (
    <div className="signin-page">
      <div className="signin-bg" aria-hidden="true"></div>
      <div className="signin-thm"><ThemeSwitch /></div>
      <main className="signin-main">
        <div className="signin-card">
          <header className="signin-head">
            <span className="signin-mark"><img src="/assets/minawa-mark.png" alt="Minawa Group" /></span>
            <p className="signin-eyebrow">Minawa Group ERP</p>
            <h1 className="signin-title">New password</h1>
            <p className="signin-sub">{data.user ? `For ${data.user.email}` : 'Choose a new password for your CRM account.'}</p>
          </header>
          {e ? <div className="callout bad" style={{ marginBottom: 16 }}><div>{e}</div></div> : null}
          {ok ? <div className="callout good" style={{ marginBottom: 16 }}><div>{ok}</div></div> : null}
          <form action={resetAction} className="signin-form">
            {th ? <input type="hidden" name="th" value={th} /> : null}
            <div><label htmlFor="pw">New password</label><PasswordInput id="pw" name="password" autoComplete="new-password" required placeholder="At least 8 characters" /></div>
            <div><label htmlFor="pw2">New password again</label><PasswordInput id="pw2" name="again" autoComplete="new-password" required placeholder="Same as above" /></div>
            <div className="signin-actions"><Submit className="signin-btn" pendingText="Saving…"><span>Save new password</span></Submit></div>
          </form>
        </div>
      </main>
    </div>
  );
}
