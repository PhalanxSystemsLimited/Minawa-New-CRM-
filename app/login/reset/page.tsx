// Choose a new password, after opening the reset link from the email (app/auth/reset signs you in for this).
import { redirect } from 'next/navigation';
import { resetAction } from '@/lib/actions-password';
import { supabaseOn, supabaseServer } from '@/lib/session';
import { Submit, PasswordInput } from '@/components/client';
import { ThemeSwitch } from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function Reset({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const { e, ok } = await searchParams;
  if (!supabaseOn()) redirect('/login');
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) redirect('/login/forgot?e=' + encodeURIComponent('Open the reset link from your email first (it works once, for one hour).'));
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
            <p className="signin-sub">For {data.user.email}</p>
          </header>
          {e ? <div className="callout bad" style={{ marginBottom: 16 }}><div>{e}</div></div> : null}
          {ok ? <div className="callout good" style={{ marginBottom: 16 }}><div>{ok}</div></div> : null}
          <form action={resetAction} className="signin-form">
            <div><label htmlFor="pw">New password</label><PasswordInput id="pw" name="password" autoComplete="new-password" required placeholder="At least 8 characters" /></div>
            <div><label htmlFor="pw2">New password again</label><PasswordInput id="pw2" name="again" autoComplete="new-password" required placeholder="Same as above" /></div>
            <div className="signin-actions"><Submit className="signin-btn" pendingText="Saving…"><span>Save new password</span></Submit></div>
          </form>
        </div>
      </main>
    </div>
  );
}
