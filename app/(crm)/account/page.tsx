// Your account (17 Nov 2026): change your own password. Forgotten passwords are reset from the sign-in page, and an
// Admin can set anyone's password in Staff & connections → Edit.
import { requireStaff, roleName, supabaseOn } from '@/lib/session';
import { changePasswordAction } from '@/lib/actions-password';
import { Submit, PasswordInput } from '@/components/client';

export const dynamic = 'force-dynamic';

export default async function Account({ searchParams }: { searchParams: Promise<{ e?: string; ok?: string }> }) {
  const { e, ok } = await searchParams, me = await requireStaff(), local = !supabaseOn();
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Your account</div></div><div className="crumb-path">Dashboard<span>/</span>Account</div></div>
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-row"><h3>{me.name} <small>{me.email} · {roleName(me)}</small></h3></div>
      {e ? <div className="callout bad"><div>{e}</div></div> : null}
      {ok ? <div className="callout good"><div>{ok}</div></div> : null}
      {local ? <div className="callout warn"><div><b>Local mode</b> (no Supabase): everyone signs in with the test password set on the server, so there is nothing to change here.</div></div>
        : <form action={changePasswordAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-row"><label htmlFor="ac-c">Current password</label><PasswordInput id="ac-c" name="current" autoComplete="current-password" required /></div>
          <div className="form-row"><label htmlFor="ac-n">New password</label><PasswordInput id="ac-n" name="password" autoComplete="new-password" required placeholder="At least 8 characters" /></div>
          <div className="form-row"><label htmlFor="ac-a">New password again</label><PasswordInput id="ac-a" name="again" autoComplete="new-password" required /></div>
          <div className="m-actions" style={{ justifyContent: 'flex-start' }}><Submit>Change password</Submit></div>
        </form>}
      <p className="cell-sub" style={{ marginTop: 12 }}>Forgot your password? Sign out and use &quot;Forgot password?&quot; on the sign-in page, or ask the Admin to set a new one.</p>
    </div>
  </>;
}
