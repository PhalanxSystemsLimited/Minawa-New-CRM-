// The building manager's screen (25 Nov 2026). Building managers only enter payments, so their whole CRM is:
//  · a slim top bar (logo, building, name, Sign out), no sidebar, bell or other pages (the layout sends any other
//    address back here, and lib/ops.ts mutate refuses every other change from a building manager);
//  · Home: the black "money" box for his buildings (collected this month of the target, still to collect, apartments
//    owing, cash in his hand, bank payments waiting for the accountant), search, today's line and the customer list;
//  · a customer's page (/m/<building>/<customer>): full history to read, and Add payment;
//  · after Save, the screen locks on "Send the receipt" to that customer (components/MgrReceipt.tsx), with Cancel
//    (the receipt then waits in his accountant's Receipts to send).
// The cash he holds is his entries the accountant hasn't approved yet: he brings the cash and his list to the
// accountant, who approves each entry (that is the hand-over).
import type { Owner, Staff, State, Payment, Proof } from '@/lib/types';
import { liveProjects, load } from '@/lib/ops';
import { use, ownerById, balance, billsOf, unpaid, periodLabel, projStats, payLimits, isUtilBill } from '@/lib/engine';
import { custId } from '@/lib/people';
import { roleName } from '@/lib/session';
import { rs, fd, fds, t12, MONL, todayPKT } from '@/lib/fmt';
import { Go, Submit, ModalShell } from '@/components/client';
import { Ic } from '@/components/icons';
import { recordPaymentAction } from '@/lib/actions';
import { MgrPayFields } from '@/components/MgrPay';
import { ReceiptLock } from '@/components/MgrReceipt';
import { WaReturnPrompt } from '@/components/WaReturnPrompt';
import { NavProgress } from '@/components/NavProgress';
import { Suspense } from 'react';
import { photoStore } from '@/lib/images';

const FIRST = 30, MORE = 50;
const digits = (v: string) => v.replace(/\D/g, '');

/** The slim shell around a building manager's pages. */
export async function ManagerShell({ staff, signOut, children }: { staff: Staff; signOut: () => Promise<void>; children: React.ReactNode }) {
  const projs = await liveProjects(staff);
  const where = projs.length === 1 ? projs[0].name : projs.length ? `${projs.length} buildings` : 'No building yet';
  return <>
    <div className="mgr-app">
      <header className="mgr-top">
        <Go href="/" className="mgr-logo" ariaLabel="Home"><img src="/assets/minawa-mark.png" alt="" /></Go>
        <div className="mgr-who"><b>{where}</b><small>{staff.name} · {roleName(staff)}</small></div>
        <form action={signOut}><button type="submit" className="mgr-out">Sign out</button></form>
      </header>
      <main id="main" className="mgr-main">{children}</main>
    </div>
    <WaReturnPrompt />
    <Suspense><NavProgress /></Suspense>
  </>;
}

/** A building manager's own entries (payments he entered) in one building. */
const myEntries = (s: State, me: Staff) => s.proofs.filter(p => p.kind === 'cash' && p.byId === me.id);
const isBank = (p: { method?: string | null }) => (p.method || 'Cash') === 'Bank transfer';

/** The money box figures for his buildings. */
function money(states: State[], me: Staff) {
  const today = todayPKT();
  let coll = 0, target = 0, outstanding = 0, owing = 0, cash = 0, cashN = 0, bank = 0, bankN = 0, todayN = 0, todayAmt = 0;
  for (const s of states) use(s, () => {
    const st = projStats(); coll += st.coll; target += st.target; outstanding += st.outstanding; owing += st.owing;
    for (const p of myEntries(s, me)) {
      if (p.status === 'pending') { if (isBank(p)) { bank += p.amount; bankN++; } else { cash += p.amount; cashN++; } }
      if (p.d === today && p.status !== 'cancelled') { todayN++; todayAmt += p.amount; }
    }
  });
  const waitToday = states.reduce((a, s) => a + myEntries(s, me).filter(p => p.d === today && p.status === 'pending').length, 0);
  return { coll, target, pct: target ? Math.round(100 * coll / target) : 0, outstanding, owing, cash, cashN, bank, bankN, todayN, todayAmt, waitToday };
}

function MoneyBox({ m }: { m: ReturnType<typeof money> }) {
  const mon = MONL[+todayPKT().slice(5, 7) - 1];
  return <section className="mgr-money" aria-label="Money at a glance">
    <div className="mgr-k">{mon.toUpperCase()}</div>
    <div className="mgr-big num">{rs(m.coll)} <small>collected</small></div>
    <div className="mgr-k2">{m.target ? `of ${rs(m.target)} target · ${m.pct}%` : 'no target set for this month'}</div>
    <div className="mgr-bar" role="progressbar" aria-valuenow={Math.min(100, m.pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Collected of the target"><i style={{ width: `${Math.min(100, m.pct)}%` }}></i></div>
    <div className="mgr-mini">
      <div><b className="num">{rs(m.outstanding)}</b><span>Still to collect</span></div>
      <div><b className="num">{m.owing}</b><span>Apartments owing</span></div>
      <div className="cash"><b className="num">{rs(m.cash)}</b><span>Cash in my hand{m.cashN ? ` · ${m.cashN} entr${m.cashN === 1 ? 'y' : 'ies'}` : ''}</span></div>
      <div><b className="num">{m.bankN}</b><span>Bank payment{m.bankN === 1 ? '' : 's'} waiting{m.bankN ? ` · ${rs(m.bank)}` : ''}</span></div>
    </div>
  </section>;
}

const match = (o: Owner, q: string) => {
  if (!q) return true;
  const t = q.toLowerCase(), d = digits(q);
  return o.apt.toLowerCase().includes(t) || o.name.toLowerCase().includes(t) || custId(o).toLowerCase().includes(t)
    || (d.length >= 3 && (digits(o.phone || '').includes(d.replace(/^0/, '')) || digits(o.cnic || '').includes(d)));
};

/** Home: the money box, search and the customer list. */
export async function ManagerHome({ staff, sp }: { staff: Staff; sp: Record<string, string> }) {
  const projs = await liveProjects(staff);
  if (!projs.length) return <div className="mgr-empty"><b>No building assigned yet</b><p>Ask the Admin to tick your building on Staff &amp; connections.</p></div>;
  const states = await Promise.all(projs.map(p => load(p.id, staff)));
  const pick = projs.length > 1 && projs.some(p => p.id === sp.b) ? sp.b : '', shown = pick ? states.filter(s => s.project === pick) : states;
  const m = money(shown, staff), q = String(sp.q || '').trim().slice(0, 60);
  const rows = shown.flatMap(s => use(s, () => s.owners.filter(o => o.status === 'active' && match(o, q))
    .map(o => ({ o, s, bal: balance(o), pname: s.proj.name }))))
    .sort((a, b) => a.pname.localeCompare(b.pname) || a.o.apt.localeCompare(b.o.apt, 'en', { numeric: true }));
  const n = sp.n === 'all' ? rows.length : Math.min(rows.length, Math.max(FIRST, Math.round(+(sp.n || 0)) || FIRST)), list = rows.slice(0, n);
  const href = (k: Record<string, string>) => '/?' + new URLSearchParams(Object.entries({ b: pick, q, ...k }).filter(([, v]) => v)).toString();
  return <div className="mgr-home">
    {projs.length > 1 ? <nav className="mgr-chips" aria-label="Buildings">
      <a href={href({ b: '' })} className={'chipbtn' + (!pick ? ' on' : '')}>All buildings</a>
      {projs.map(p => <a key={p.id} href={href({ b: p.id })} className={'chipbtn' + (pick === p.id ? ' on' : '')}>{p.name}</a>)}
    </nav> : null}
    <MoneyBox m={m} />
    <form className="mgr-search" action="/" role="search">
      {pick ? <input type="hidden" name="b" value={pick} /> : null}
      <Ic n="search" s={18} />
      <input name="q" type="search" defaultValue={q} placeholder="Search flat, name, phone, CNIC" aria-label="Search customers" autoComplete="off" />
      {q ? <a href={href({ q: '' })} className="mgr-clear">Clear</a> : null}
    </form>
    <div className="mgr-today"><span>Today: <b>{m.todayN} payment{m.todayN === 1 ? '' : 's'}</b> · {rs(m.todayAmt)}</span><span><b>{m.waitToday}</b> waiting for accountant</span></div>
    {list.length ? <div className="mgr-list">{list.map(({ o, s, bal }) => <div className="mgr-cu" key={s.project + o.id}>
      <a href={`/m/${s.project}/${encodeURIComponent(o.id)}`} className="mgr-cu-main">
        <span className="mgr-apt">{o.apt}</span>
        <span className="mgr-n"><b>{o.name}</b><small>{o.phone || 'No WhatsApp number'}{projs.length > 1 && !pick ? ` · ${s.proj.name}` : ''}</small>
          {bal > 0 ? <span className="owe">Owes {rs(bal)}</span> : bal < 0 ? <span className="adv">{rs(-bal)} advance</span> : <span className="paid">Paid up</span>}</span>
      </a>
      <a href={`/m/${s.project}/${encodeURIComponent(o.id)}?pay=1`} className="mgr-pay">Add payment</a>
    </div>)}</div> : <div className="mgr-empty"><b>{q ? `Nobody matches "${q}"` : 'No customers yet'}</b><p>{q ? 'Try the flat number, part of the name, or the phone number.' : 'Customers appear here once the accountant adds them.'}</p></div>}
    {rows.length > list.length ? <div className="mgr-more"><span>Showing {list.length} of {rows.length}</span>
      <a className="btn" href={href({ n: String(list.length + MORE) })}>Show {Math.min(MORE, rows.length - list.length)} more</a>
      <a className="btn ghost" href={href({ n: 'all' })}>Show all</a></div> : null}
  </div>;
}

/** The tag on a payment for the manager: still waiting for the accountant, approved, or not received. */
function payState(p: Payment, s: State) {
  const pr = p.entryId ? s.proofs.find(x => x.id === p.entryId) : null;
  if (p.reversed) return pr?.status === 'rejected' ? <span className="tag bad">Not received</span> : <span className="tag">Taken back</span>;
  if (pr && pr.status === 'pending') return <span className="tag warn">Waiting</span>;
  return <span className="tag good">Approved</span>;
}

/** A customer's page: balance, unpaid bills, payments / bills / history (read only), and Add payment. */
export async function ManagerCustomer({ staff, pid, oid, sp }: { staff: Staff; pid: string; oid: string; sp: Record<string, string> }) {
  const projs = await liveProjects(staff);
  if (!projs.some(p => p.id === pid)) return <div className="mgr-empty"><b>This building isn&apos;t assigned to you</b><p><a href="/">Back to your customers</a></p></div>;
  const s = await load(pid, staff);
  return use(s, () => {
    const o = ownerById(oid);
    if (!o) return <div className="mgr-empty"><b>Customer not found</b><p><a href="/">Back to your customers</a></p></div>;
    const bal = balance(o), bills = billsOf(o), open = bills.filter(b => unpaid(b) > 0);
    const pays = s.payments.filter(p => p.ownerId === o.id).sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t));
    const old = s.proofs.filter(p => p.ownerId === o.id && p.kind === 'cash' && !p.payId && p.status === 'pending');   // entries from before 19 Nov 2026
    // History: the customer's account, line by line (bills, payments, fines, discounts), with the balance after each.
    let run = 0;
    const hist = s.entries.filter(e => e.ownerId === o.id).map(e => { run += e.amount; return { e, run }; }).reverse().slice(0, 80);
    const tab = sp.tab === 'bills' || sp.tab === 'history' ? sp.tab : 'payments', base = `/m/${pid}/${encodeURIComponent(o.id)}`;
    const elec = s.settings.rules.utilities.includes('Electricity') && bills.some(b => isUtilBill(b));
    const rcPay = sp.rc ? s.payments.find(p => p.id === sp.rc && p.ownerId === o.id) || null : null;
    const lim = payLimits(o);
    return <div className="mgr-cust">
      <div className="mgr-hd"><a href="/" className="mgr-back" aria-label="Back to your customers">‹</a>
        <div><b>{o.name} · {o.apt}</b><small>{custId(o)} · {o.phone || 'no WhatsApp number'}{o.type ? ` · ${o.type}` : ''} · {s.proj.name}</small></div></div>
      <div className="mgr-card mgr-bal"><div className="mgr-lab">Balance</div>
        <div className="mgr-bal-r"><b className={bal > 0 ? 'owe' : bal < 0 ? 'adv' : ''}>{bal > 0 ? rs(bal) : bal < 0 ? `${rs(-bal)} advance` : 'Paid up'}</b>
          {open.length ? <span className="tag warn">{open.length} bill{open.length === 1 ? '' : 's'} unpaid</span> : <span className="tag good">No unpaid bills</span>}</div></div>
      <nav className="mgr-tabs" aria-label="Customer history">
        {([['payments', 'Payments'], ['bills', 'Bills'], ['history', 'History']] as const).map(([k, l]) => <a key={k} href={k === 'payments' ? base : `${base}?tab=${k}`} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}>{l}</a>)}
      </nav>
      <div className="mgr-card mgr-hist">
        {tab === 'payments' ? (pays.length || old.length ? <>
          {old.map((p: Proof) => <div className="mgr-hl" key={p.id}><span><b className="num">{rs(p.amount)}</b> {isBank(p) ? 'bank transfer' : 'cash'}<small>{fds(p.d)} {t12(p.t)}{p.ref ? ` · ${p.ref}` : ''} · entered by {p.byId === staff.id ? 'you' : p.byName}</small></span><span className="tag warn">Waiting</span></div>)}
          {pays.map(p => <div className="mgr-hl" key={p.id}><span><b className="num">{rs(p.amount)}</b> {/bank/i.test(p.method) ? 'bank transfer' : 'cash'}
            <small>{p.d === todayPKT() ? `Today ${t12(p.t)}` : fds(p.d)} · {p.receipt}{p.txn ? ` · TXN ${p.txn}` : ''}{p.enteredBy ? ` · entered by ${p.enteredBy === staff.name ? 'you' : p.enteredBy}` : ''}</small></span>{payState(p, s)}</div>)}
        </> : <p className="mgr-none">No payments yet.</p>) : null}
        {tab === 'bills' ? (bills.length ? [...bills].reverse().map(b => { const left = unpaid(b); return <div className="mgr-hl" key={b.id}>
          <span><b>{isUtilBill(b) ? 'Electricity' : 'Maintenance'} · {periodLabel(b)}</b><small>{rs(b.net + b.fine)} · due {fd(b.dueDate)}</small></span>
          {left > 0 ? <span className="tag bad">{rs(left)} unpaid</span> : <span className="tag good">Paid</span>}</div>; }) : <p className="mgr-none">No bills yet.</p>) : null}
        {tab === 'history' ? (hist.length ? hist.map(({ e, run: r }) => <div className="mgr-hl" key={e.id}><span>{e.desc}<small>{fds(e.d)}{e.ref ? ` · ${e.ref}` : ''} · balance {r < 0 ? `${rs(-r)} advance` : rs(r)}</small></span>
          <b className={`num${e.amount < 0 ? ' adv' : ''}`}>{e.amount < 0 ? '−' + rs(-e.amount) : rs(e.amount)}</b></div>) : <p className="mgr-none">Nothing yet.</p>) : null}
      </div>
      <div className="mgr-sticky"><a href={`${base}?pay=1`} className="mgr-save">Add payment</a></div>
      {sp.pay ? <ModalShell title={`Add payment · ${o.apt}`} closeKeys={['pay', 't', 'method']}>
        <form action={recordPaymentAction} className="mgr-form">
          <input type="hidden" name="pid" value={pid} /><input type="hidden" name="oid" value={o.id} />
          {sp.t ? <div className="callout bad" role="alert"><div>{sp.t}</div></div> : null}
          <div className="mgr-owes"><span>{o.name} owes</span><b className="num">{rs(Math.max(0, bal))}</b></div>
          <MgrPayFields pid={pid} oid={o.id} who={o.name} owed={lim.owed} cap={lim.cap} def={Math.max(0, bal)} today={s.today} method={sp.method === 'bank' ? 'bank' : 'cash'} elec={elec} photos={!!photoStore()} />
          <Submit className="btn primary mgr-save-btn">Save payment</Submit>
        </form>
      </ModalShell> : null}
      {rcPay ? <ReceiptLock pid={pid} oid={o.id} name={o.name} apt={o.apt} phone={o.noPhone || o.invalidPhone ? '' : o.phone || ''}
        amount={rs(rcPay.amount)} method={/bank/i.test(rcPay.method) ? 'Bank transfer' : 'Cash'} receipt={rcPay.receipt} back={base} /> : null}
    </div>;
  });
}
