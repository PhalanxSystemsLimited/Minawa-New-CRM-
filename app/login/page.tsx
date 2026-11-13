import { signIn } from './actions';
import { supabaseOn } from '@/lib/session';
import { Submit, PasswordInput } from '@/components/client';

export const dynamic = 'force-dynamic';

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  const local = !supabaseOn();
  return (
    <div className="signin-page">
      <div className="signin-bg" aria-hidden="true"></div>
      <main className="signin-main">
        <div className="signin-card">
          <header className="signin-head">
            <span className="signin-mark"><img src="/assets/minawa-mark.png" alt="Minawa Group" /></span>
            <p className="signin-eyebrow">Minawa Group ERP</p>
            <h1 className="signin-title">Sign in</h1>
            <p className="signin-sub">Maintenance dues, WhatsApp bills and Safepay payments.</p>
          </header>
          {e ? <div className="callout bad" style={{ marginBottom: 16 }}><div>{e}</div></div> : null}
          <form action={signIn} className="signin-form">
            <div><label htmlFor="em">Email</label><input id="em" name="email" type="email" autoComplete="username" required placeholder="name@minawa.com" defaultValue={local ? 'admin@minawa.local' : ''} /></div>
            <div><label htmlFor="pw">Password</label><PasswordInput id="pw" name="password" autoComplete="current-password" required placeholder="••••••••••••" /></div>
            <div className="signin-actions"><Submit className="signin-btn" pendingText="Signing in…">Sign in</Submit></div>
          </form>
          {local ? <div className="callout warn" style={{ marginTop: 18 }}><div><b>Local mode</b> (no Supabase connected). Sign in as <b>admin@minawa.local</b> or <b>accountant@minawa.local</b>, password <b>minawa</b>. Data is kept in <code>data/local-db.json</code>.</div></div> : null}
        </div>
        <footer className="signin-foot">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>Minawa Group ERP Portal • Secure 256-bit Encrypted</span>
        </footer>
      </main>
    </div>
  );
}
