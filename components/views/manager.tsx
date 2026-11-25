// The building manager's screen (25–26 Nov 2026). Since 26 Nov 2026 it is one screen, Payment requests:
//  · a slim top bar (logo, building, theme, his name, Sign out); no sidebar, bell or other pages (the layout sends any
//    other address back here, and lib/ops.ts mutate refuses every other change from a building manager);
//  · his accountant's open payment requests (customer and flat, amount, cash or bank transfer, the months it is for,
//    the accountant's note), each answered with an entry: the cash book number he wrote by hand for the customer (or
//    the bank transfer's ID and photo). No customer list, balances or stats, and no WhatsApp: the accountant approves
//    the entry when the money reaches him and sends the receipt from his To do;
//  · Done: his entries, waiting for the accountant or approved. One the accountant didn't receive comes back to Open.
import type { Staff, State, Proof, PayRequest } from '@/lib/types';
import { liveProjects, load } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { roleName } from '@/lib/session';
import { rs, fds, t12, todayPKT, periodText } from '@/lib/fmt';
import { Go, Submit, ModalShell } from '@/components/client';
import { Ic } from '@/components/icons';
import { enterRequestAction } from '@/lib/actions-requests';
import { PhotoField } from '@/components/PhotoField';
import { NavProgress } from '@/components/NavProgress';
import { Suspense } from 'react';
import { ThemeSwitch } from '@/components/Shell';
import { photoStore } from '@/lib/images';


/** The slim shell around a building manager's pages: logo, building, his name, the theme (Light, Dark or Frost, his
 *  choice, kept in this browser) and Sign out. */
export async function ManagerShell({ staff, signOut, children }: { staff: Staff; signOut: () => Promise<void>; children: React.ReactNode }) {
  const projs = await liveProjects(staff);
  const where = projs.length === 1 ? projs[0].name : projs.length ? `${projs.length} buildings` : 'No building yet';
  const ini = staff.name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'BM';
  return <>
    <div className="lv-aurora mgr-aurora" aria-hidden="true"><i className="a1"></i><i className="a2"></i><i className="a3"></i></div>
    <div className="mgr-app">
      <header className="mgr-top">
        <Go href="/" className="mgr-logo" ariaLabel="Home"><img src="/assets/minawa-mark.png" alt="" /></Go>
        <div className="mgr-who"><b>{where}</b><small>Minawa Group · Maintenance</small></div>
        <div className="mgr-thm"><ThemeSwitch /></div>
        <div className="mgr-me"><span className="mgr-av" aria-hidden="true">{ini}</span><span className="mgr-me-t"><b>{staff.name}</b><small>{roleName(staff)}</small></span></div>
        <form action={signOut}><button type="submit" className="mgr-out"><Ic n="logout" s={16} /><span>Sign out</span></button></form>
      </header>
      <main id="main" className="mgr-main">{children}</main>
    </div>
    <Suspense><NavProgress /></Suspense>
  </>;
}

type Row = { r: PayRequest; s: State; apt: string; name: string; pname: string; pr: Proof | null };
const hello = () => { const h = +new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', hour12: false }); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const ago = (d: string, t: string, today: string) => d === today ? `today ${t12(t)}` : fds(d);

/** Payment requests: the building manager's only screen. */
export async function ManagerHome({ staff, sp }: { staff: Staff; sp: Record<string, string> }) {
  const projs = await liveProjects(staff);
  if (!projs.length) return <div className="mgr-empty"><b>No building assigned yet</b><p>Ask the Admin to tick your building on Staff &amp; connections.</p></div>;
  const states = await Promise.all(projs.map(p => load(p.id, staff)));
  const today = todayPKT(), multi = projs.length > 1;
  const rows: Row[] = states.flatMap(s => use(s, () => (s.requests || []).filter(r => r.managerId === staff.id).map(r => {
    const o = ownerById(r.ownerId);
    return { r, s, apt: o?.apt || '', name: o?.name || '', pname: s.proj.name, pr: r.proofId ? s.proofs.find(x => x.id === r.proofId) || null : null };
  })));
  const open = rows.filter(x => x.r.status === 'open').sort((a, b) => `${a.r.d} ${a.r.t}`.localeCompare(`${b.r.d} ${b.r.t}`));
  const done = rows.filter(x => x.r.status === 'entered').sort((a, b) => `${b.r.doneD} ${b.r.doneT}`.localeCompare(`${a.r.doneD} ${a.r.doneT}`)).slice(0, 40);
  const v = sp.v === 'done' ? 'done' : 'open', first = staff.name.trim().split(/\s+/)[0] || 'there';
  const pick = sp.r ? rows.find(x => `${x.s.project}:${x.r.id}` === sp.r && x.r.status === 'open') : null;
  const mtag = (m: string) => m === 'Cash' ? <span className="tag mgr-cash"><Ic n="cash" s={13} /> Cash</span> : <span className="tag mgr-bank"><Ic n="bank" s={13} /> Bank transfer</span>;
  return <div className="mgr-home mgr-req">
    <div className="mgr-hello">
      <div><div className="mgr-eyebrow">{new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
        <h1>Payment requests</h1>
        <p>{hello()}, {first}. Collect each payment, give the customer a receipt from your cash book, then enter it here.</p></div>
    </div>
    <nav className="mgr-tabs mgr-req-tabs" aria-label="Payment requests">
      <a href="/" className={v === 'open' ? 'on' : ''} aria-current={v === 'open' ? 'page' : undefined}>To collect <span className="mgr-cnt">{open.length}</span></a>
      <a href="/?v=done" className={v === 'done' ? 'on' : ''} aria-current={v === 'done' ? 'page' : undefined}>Entered <span className="mgr-cnt">{done.length}</span></a>
    </nav>
    {v === 'open' ? (open.length ? <div className="mgr-rq-list">{open.map(({ r, s, apt, name, pname }) => <article className={'mgr-rq' + (r.reply ? ' back' : '')} key={s.project + r.id}>
      <div className="mgr-rq-top">
        <span className="mgr-apt">{apt}</span>
        <div className="mgr-rq-who"><b>{name}</b><small>{multi ? `${pname} · ` : ''}Request {r.id} · from {r.byName}, {ago(r.d, r.t, today)}</small></div>
        <div className="mgr-rq-amt"><b className="num">{rs(r.amount)}</b>{mtag(r.method)}</div>
      </div>
      <div className="mgr-rq-meta">
        <span><Ic n="cal" s={14} /> For <b>{periodText(r.periodFrom, r.periodTo)}</b>{r.forWhat === 'electricity' ? ' · electricity' : ' · maintenance'}</span>
        {r.note ? <span><Ic n="msg" s={14} /> {r.note}</span> : null}
      </div>
      {r.reply ? <div className="callout bad mgr-rq-back"><div><b>Came back:</b> {r.reply}. Put it right with the customer and enter it again.</div></div> : null}
      <a href={`/?r=${encodeURIComponent(`${s.project}:${r.id}`)}`} className="mgr-save mgr-rq-go"><Ic n="plus" s={16} /> Enter payment</a>
    </article>)}</div>
      : <div className="mgr-empty mgr-rq-empty"><span className="mgr-rq-ok"><Ic n="okc" s={26} /></span><b>No payment requests right now</b><p>When your accountant asks you to collect a payment, it shows here.</p></div>)
    : (done.length ? <div className="mgr-card mgr-hist">{done.map(({ r, s, apt, name, pname, pr }) => <div className="mgr-hl" key={s.project + r.id}>
        <span><b className="num">{rs(pr?.amount ?? r.amount)}</b> {r.method === 'Cash' ? 'cash' : 'bank transfer'} · {apt} {name}
          <small>{multi ? `${pname} · ` : ''}For {periodText(r.periodFrom, r.periodTo)} · {pr?.ref ? `cash book ${pr.ref}` : pr?.txn ? `TXN ${pr.txn}` : ''} · entered {ago(r.doneD || r.d, r.doneT || r.t, today)}</small></span>
        {pr?.status === 'verified' ? <span className="tag good">Approved</span> : <span className="tag warn">Waiting for accountant</span>}</div>)}</div>
      : <div className="mgr-empty"><b>Nothing entered yet</b><p>The payments you enter show here until your accountant approves them.</p></div>)}
    {pick ? <ModalShell title={`Enter payment · ${pick.apt}`} closeKeys={['r', 't']}>
      <form action={enterRequestAction} className="mgr-form">
        <input type="hidden" name="pid" value={pick.s.project} /><input type="hidden" name="id" value={pick.r.id} /><input type="hidden" name="method" value={pick.r.method} />
        {sp.t ? <div className="callout bad" role="alert"><div>{sp.t}</div></div> : null}
        <div className="mgr-rc">
          <div><span>Customer</span><b>{pick.apt} · {pick.name}</b></div>
          <div><span>To collect</span><b>{rs(pick.r.amount)} · {pick.r.method}</b></div>
          <div><span>For</span><b>{periodText(pick.r.periodFrom, pick.r.periodTo)}</b></div>
          <div><span>Request</span><b>{pick.r.id} · {pick.r.byName}</b></div>
        </div>
        <div className="form-row"><label htmlFor="rq-amt">Amount you collected (Rs)</label><input id="rq-amt" name="amount" type="number" inputMode="numeric" min={1} step={1} required defaultValue={pick.r.amount} className="mgr-amt" /></div>
        {pick.r.method === 'Cash'
          ? <div className="form-row"><label htmlFor="rq-ref">Cash book number</label><input id="rq-ref" name="ref" type="text" required maxLength={60} placeholder="The number on the receipt you wrote, e.g. 1042" autoFocus /></div>
          : <><div className="form-row"><label htmlFor="rq-txn">Bank transaction ID</label><input id="rq-txn" name="txn" type="text" required maxLength={80} placeholder="e.g. FT2611180042" autoFocus /></div>
            {photoStore() ? <PhotoField pid={pick.s.project} owner={pick.r.ownerId} label="Photo of the bank transfer" hint="The transfer on the customer's phone screen, or the bank slip." required />
              : <div className="callout"><div>Photos aren&apos;t set up yet, so no photo is needed for now.</div></div>}</>}
        <div className="form-row"><label htmlFor="rq-n">Note (optional)</label><input id="rq-n" name="note" type="text" maxLength={200} placeholder="e.g. Paid by his son" /></div>
        <p className="mgr-hint">No WhatsApp is sent now. Your accountant sends the receipt to the customer once he approves this entry.</p>
        <Submit className="btn primary mgr-save-btn">Save entry</Submit>
      </form>
    </ModalShell> : null}
  </div>;
}
