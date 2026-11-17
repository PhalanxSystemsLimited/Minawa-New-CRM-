// "Forgot password?": asks Supabase to email a reset link.
import { forgotAction } from '@/lib/actions-password';
import { supabaseOn } from '@/lib/session';
import { Submit } from '@/components/client';
import { ThemeSwitch } from '@/components/Shell';

export const dynamic = 'force-dynamic';

export default async function Forgot({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const { e, ok } = await searchParams, local = !supabaseOn();
  return (
    <div className="signin-page">
      <div className="signin-bg" aria-hidden="true"></div>
      <div className="signin-thm"><ThemeSwitch /></div>
      <main className="signin-main">
        <div className="signin-card">
          <header className="signin-head">
            <span className="signin-mark"><img src="/assets/minawa-mark.png" alt="Minawa Group" /></span>
            <p className="signin-eyebrow">Minawa Group ERP</p>
            <h1 className="signin-title">Forgot password</h1>
            <p className="signin-sub">We email you a link to choose a new password.</p>
          </header>
          {e ? <div className="callout bad" style={{ marginBottom: 16 }}><div>{e}</div></div> : null}
          {ok ? <div className="callout good" style={{ marginBottom: 16 }}><div>{ok}</div></div> : null}
          {local ? <div className="callout warn"><div><b>Local mode</b> (no Supabase): there is no email sign-in here. Use the test password, or ask the Admin.</div></div> : <form action={forgotAction} className="signin-form">
            <div><label htmlFor="em">Email</label><input id="em" name="email" type="email" autoComplete="username" required placeholder="name@minawa.com" /></div>
            <div className="signin-actions"><Submit className="signin-btn" pendingText="Sending…"><span>Email me a reset link</span></Submit></div>
          </form>}
          <p className="signin-sub" style={{ marginTop: 16 }}><a href="/login">Back to sign in</a> · Can&apos;t get the email? The Admin can set a new password for you in Staff &amp; connections.</p>
        </div>
      </main>
    </div>
  );
}
