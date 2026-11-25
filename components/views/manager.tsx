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
import { rs, fd, fds, t12, MONL, todayPKT, fm, periodText } from '@/lib/fmt';

const addMonths = (p: string, n: number) => { const d = new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
import { Go, Submit, ModalShell } from '@/components/client';
import { Ic } from '@/components/icons';
import { recordPaymentAction } from '@/lib/actions';
import { MgrPayFields } from '@/components/MgrPay';
import { ReceiptLock } from '@/components/MgrReceipt';
import { WaReturnPrompt } from '@/components/WaReturnPrompt';
import { NavProgress } from '@/components/NavProgress';
import { Suspense } from 'react';
import { ThemeSwitch } from '@/components/Shell';
import { photoStore } from '@/lib/images';

const FIRST = 30, MORE = 50;
const digits = (v: string) => v.replace(/\D/g, '');

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
  let coll = 0, target = 0, outstanding = 0, owing = 0, flats = 0, cash = 0, cashN = 0, bank = 0, bankN = 0, todayN = 0, todayAmt = 0, mine = 0, mineN = 0;
  for (const s of states) use(s, () => {
    const st = projStats(); coll += st.coll; target += st.target; outstanding += st.outstanding; owing += st.owing; flats += st.flats;
    for (const p of myEntries(s, me)) {
      if (p.status === 'pending') { if (isBank(p)) { bank += p.amount; bankN++; } else { cash += p.amount; cashN++; } }
      if (p.d === today && p.status !== 'cancelled') { todayN++; todayAmt += p.amount; }
      if (p.d.slice(0, 7) === today.slice(0, 7) && p.status !== 'cancelled' && p.status !== 'rejected') { mine += p.amount; mineN++; }
    }
  });
  const waitToday = states.reduce((a, s) => a + myEntries(s, me).filter(p => p.d === today && p.status === 'pending').length, 0);
  return { coll, target, pct: target ? Math.round(100 * coll / target) : 0, outstanding, owing, flats, cash, cashN, bank, bankN, todayN, todayAmt, waitToday, mine, mineN };
}

/** The progress ring: collected of the month's target (or the share of customers paid up when there is no target). */
function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 46, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
  return <div className="mgr-ring" role="img" aria-label={`${v}% ${label}`}>
    <svg viewBox="0 0 108 108" width="108" height="108" aria-hidden="true"><circle cx="54" cy="54" r={r} className="t" /><circle cx="54" cy="54" r={r} className="v" strokeDasharray={`${(c * v / 100).toFixed(1)} ${c.toFixed(1)}`} /></svg>
    <span><b className="num">{v}%</b><small>{label}</small></span>
  </div>;
}

function MoneyBox({ m }: { m: ReturnType<typeof money> }) {
  const mon = MONL[+todayPKT().slice(5, 7) - 1], paidUp = m.flats ? Math.round(100 * (m.flats - m.owing) / m.flats) : 0;
  const tile = (icon: string, tone: string, v: string, l: string, sub?: string) => <div className={`mgr-kpi t-${tone}`}><span className="mgr-kic"><Ic n={icon} s={18} /></span><span><b className="num">{v}</b><small>{l}</small>{sub ? <em>{sub}</em> : null}</span></div>;
  return <section className="mgr-money" aria-label="Money at a glance">
    <div className="mgr-money-top">
      <Ring pct={m.target ? m.pct : paidUp} label={m.target ? `${mon.slice(0, 3)} target` : 'paid up'} />
      <div className="mgr-money-t">
        <div className="mgr-k">{mon.toUpperCase()} · YOUR BUILDING{m.flats ? `S · ${m.flats} CUSTOMERS` : ''}</div>
        <div className="mgr-big num">{rs(m.coll)} <small>collected</small></div>
        <div className="mgr-k2">{m.target ? `of ${rs(m.target)} target · ${m.pct}%` : `${m.flats - m.owing} of ${m.flats} customers are paid up`}</div>
        <div className="mgr-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, m.target ? m.pct : paidUp)}%` }}></i></div>
        <div className="mgr-k2">You entered <b>{rs(m.mine)}</b> this month · {m.mineN} payment{m.mineN === 1 ? '' : 's'}</div>
      </div>
    </div>
    <div className="mgr-mini">
      {tile('wallet', 'rust', rs(m.outstanding), 'Still to collect')}
      {tile('building', 'blue', String(m.owing), 'Apartments owing', m.flats ? `of ${m.flats}` : undefined)}
      {tile('cash', 'cash', rs(m.cash), 'Cash in my hand', m.cashN ? `${m.cashN} entr${m.cashN === 1 ? 'y' : 'ies'} to hand over` : 'nothing to hand over')}
      {tile('bank', 'violet', String(m.bankN), `Bank payment${m.bankN === 1 ? '' : 's'} waiting`, m.bankN ? rs(m.bank) : 'none waiting')}
    </div>
  </section>;
}

const match = (o: Owner, q: string) => {
  if (!q) return true;
  const t = q.toLowerCase(), d = digits(q);
  return o.apt.toLowerCase().includes(t) || o.name.toLowerCase().includes(t) || custId(o).toLowerCase().includes(t)
    || (d.length >= 3 && (digits(o.phone || '').includes(d.replace(/^0/, '')) || digits(o.cnic || '').includes(d)));
};
const FILTERS = [['', 'All'], ['owe', 'Owes'], ['paid', 'Paid up'], ['adv', 'Advance'], ['nowa', 'No WhatsApp']] as const;
const hello = () => { const h = +new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', hour12: false }); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** Home: greeting, the money box, today and his latest entries, search, filters and the customer list. */
export async function ManagerHome({ staff, sp }: { staff: Staff; sp: Record<string, string> }) {
  const projs = await liveProjects(staff);
  if (!projs.length) return <div className="mgr-empty"><b>No building assigned yet</b><p>Ask the Admin to tick your building on Staff &amp; connections.</p></div>;
  const states = await Promise.all(projs.map(p => load(p.id, staff)));
  const pick = projs.length > 1 && projs.some(p => p.id === sp.b) ? sp.b : '', shown = pick ? states.filter(s => s.project === pick) : states;
  const m = money(shown, staff), q = String(sp.q || '').trim().slice(0, 60), f = FILTERS.some(x => x[0] === sp.f) ? sp.f : '', sort = sp.s === 'owed' ? 'owed' : 'flat';
  const all = shown.flatMap(s => use(s, () => s.owners.filter(o => o.status === 'active').map(o => ({ o, s, bal: balance(o), pname: s.proj.name, hit: match(o, q) }))));   // match() needs the building's state (customer IDs)
  const noWa = (o: Owner) => !o.phone || o.noPhone || o.invalidPhone;
  const isF = (k: string, x: typeof all[number]) => !k || (k === 'owe' ? x.bal > 0 : k === 'paid' ? x.bal === 0 : k === 'adv' ? x.bal < 0 : noWa(x.o));
  const count = (k: string) => all.filter(x => x.hit && isF(k, x)).length;
  const rows = all.filter(x => x.hit && isF(f, x))
    .sort((a, b) => sort === 'owed' ? b.bal - a.bal : a.pname.localeCompare(b.pname) || a.o.apt.localeCompare(b.o.apt, 'en', { numeric: true }));
  const n = sp.n === 'all' ? rows.length : Math.min(rows.length, Math.max(FIRST, Math.round(+(sp.n || 0)) || FIRST)), list = rows.slice(0, n);
  const href = (k: Record<string, string>) => '/?' + new URLSearchParams(Object.entries({ b: pick, q, f, s: sort === 'owed' ? 'owed' : '', ...k }).filter(([, v]) => v)).toString();
  // His latest entries, newest first, with where each one stands.
  const latest = shown.flatMap(s => use(s, () => myEntries(s, staff).map(p => ({ p, s, apt: ownerById(p.ownerId)?.apt || '', name: ownerById(p.ownerId)?.name || '' }))))
    .sort((a, b) => `${b.p.d} ${b.p.t}`.localeCompare(`${a.p.d} ${a.p.t}`)).slice(0, 6);
  const today = todayPKT(), first = staff.name.trim().split(/\s+/)[0] || 'there';
  const stTag = (p: Proof) => p.status === 'pending' ? <span className="tag warn">Waiting</span> : p.status === 'verified' ? <span className="tag good">Approved</span> : p.status === 'rejected' ? <span className="tag bad">Not received</span> : <span className="tag">Cancelled</span>;
  return <div className="mgr-home">
    <div className="mgr-hello">
      <div><div className="mgr-eyebrow">{new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
        <h1>{hello()}, <span>{first}</span></h1>
        <p>{pick ? projs.find(p => p.id === pick)?.name : projs.map(p => p.name).join(' · ')} · {all.length} customers</p></div>
      {projs.length > 1 ? <nav className="mgr-chips" aria-label="Buildings">
        <a href={href({ b: '', n: '' })} className={'chipbtn' + (!pick ? ' on' : '')}>All buildings</a>
        {projs.map(p => <a key={p.id} href={href({ b: p.id, n: '' })} className={'chipbtn' + (pick === p.id ? ' on' : '')}>{p.name}</a>)}
      </nav> : null}
    </div>
    <div className="mgr-grid">
      <div className="mgr-col-main">
        <MoneyBox m={m} />
        <div className="mgr-sec"><h2><Ic n="users" s={18} /> Customers</h2><span>Tap a customer for their history, or Add payment</span></div>
        <form className="mgr-search" action="/" role="search">
          {pick ? <input type="hidden" name="b" value={pick} /> : null}{f ? <input type="hidden" name="f" value={f} /> : null}{sort === 'owed' ? <input type="hidden" name="s" value="owed" /> : null}
          <Ic n="search" s={18} />
          <input name="q" type="search" defaultValue={q} placeholder="Search flat, name, phone, CNIC" aria-label="Search customers" autoComplete="off" />
          {q ? <a href={href({ q: '', n: '' })} className="mgr-clear">Clear</a> : null}
        </form>
        <div className="mgr-filters">
          <nav className="mgr-chips" aria-label="Show">{FILTERS.map(([k, l]) => <a key={k} href={href({ f: k, n: '' })} className={'chipbtn' + (f === k ? ' on' : '')} aria-current={f === k ? 'true' : undefined}>{l} <span className="mgr-cnt">{count(k)}</span></a>)}</nav>
          <a href={href({ s: sort === 'owed' ? '' : 'owed', n: '' })} className="mgr-sort"><Ic n="filter" s={15} /> {sort === 'owed' ? 'Most owed first' : 'By flat number'}</a>
        </div>
        {list.length ? <div className="mgr-list">{list.map(({ o, s, bal }) => { const st = bal > 0 ? 'owe' : bal < 0 ? 'adv' : 'paid';
          return <div className={`mgr-cu st-${st}`} key={s.project + o.id}>
            <a href={`/m/${s.project}/${encodeURIComponent(o.id)}`} className="mgr-cu-main">
              <span className="mgr-apt">{o.apt}</span>
              <span className="mgr-n"><b>{o.name}</b><small>{noWa(o) ? <span className="mgr-nowa">No WhatsApp number</span> : o.phone}{projs.length > 1 && !pick ? ` · ${s.proj.name}` : ''}</small>
                {bal > 0 ? <span className="owe">Owes {rs(bal)}</span> : bal < 0 ? <span className="adv">{rs(-bal)} advance</span> : <span className="paid"><Ic n="okc" s={13} /> Paid up</span>}</span>
            </a>
            <a href={`/m/${s.project}/${encodeURIComponent(o.id)}?pay=1`} className="mgr-pay"><Ic n="plus" s={15} /><span>Add payment</span></a>
          </div>; })}</div>
          : <div className="mgr-empty"><b>{q ? `Nobody matches "${q}"` : f ? 'Nobody in this list' : 'No customers yet'}</b><p>{q ? 'Try the flat number, part of the name, or the phone number.' : f ? 'Choose All to see every customer.' : 'Customers appear here once the accountant adds them.'}</p></div>}
        {rows.length > list.length ? <div className="mgr-more"><span>Showing {list.length} of {rows.length}</span>
          <a className="btn" href={href({ n: String(list.length + MORE) })}>Show {Math.min(MORE, rows.length - list.length)} more</a>
          <a className="btn ghost" href={href({ n: 'all' })}>Show all</a></div> : null}
      </div>
      <aside className="mgr-col-side" aria-label="Today">
        <section className="mgr-card mgr-today-card">
          <h3><Ic n="cal" s={17} /> Today</h3>
          <div className="mgr-today-grid">
            <div><b className="num">{m.todayN}</b><small>payment{m.todayN === 1 ? '' : 's'} entered</small></div>
            <div><b className="num">{rs(m.todayAmt)}</b><small>received today</small></div>
            <div className={m.waitToday ? 'warn' : ''}><b className="num">{m.waitToday}</b><small>waiting for the accountant</small></div>
          </div>
          <p className="mgr-tip"><Ic n="info" s={14} /> Bring today&apos;s cash and your list to your accountant: he approves each entry.</p>
        </section>
        <section className="mgr-card mgr-latest">
          <h3><Ic n="history" s={17} /> Your latest entries</h3>
          {latest.length ? <div className="mgr-lat-list">{latest.map(({ p, s, apt, name }) => <a key={s.project + p.id} href={`/m/${s.project}/${encodeURIComponent(p.ownerId)}`} className="mgr-lat">
            <span className={`mgr-lat-ic ${isBank(p) ? 'bank' : 'cash'}`}><Ic n={isBank(p) ? 'bank' : 'cash'} s={15} /></span>
            <span className="mgr-lat-t"><b>{apt} · {rs(p.amount)}</b><small>{name}{p.periodFrom ? ` · ${periodText(p.periodFrom, p.periodTo)}` : ''} · {p.d === today ? t12(p.t) : fds(p.d)}</small></span>
            {stTag(p)}</a>)}</div>
            : <p className="mgr-none">Payments you enter show here, with whether the accountant has approved them.</p>}
        </section>
      </aside>
    </div>
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
    // The months the payment is for (26 Nov 2026): suggested from the unpaid bills (oldest to newest), else this month.
    const span = (list: typeof bills) => { const u = list.filter(b => unpaid(b) > 0); return u.length ? [u.map(b => b.period).sort()[0], u.map(b => b.periodEnd || b.period).sort().pop()!] as [string, string] : [s.today.slice(0, 7), s.today.slice(0, 7)] as [string, string]; };
    const pMaint = span(bills.filter(b => !isUtilBill(b))), pElec = span(bills.filter(b => isUtilBill(b)));
    const first = [pMaint[0], pElec[0], addMonths(s.today.slice(0, 7), -12)].sort()[0], months: string[] = [];
    for (let m = first; m <= addMonths(s.today.slice(0, 7), 12); m = addMonths(m, 1)) months.push(m);
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
            <small>{p.periodFrom ? `For ${periodText(p.periodFrom, p.periodTo)} · ` : ''}{p.d === todayPKT() ? `Today ${t12(p.t)}` : fds(p.d)} · {p.receipt}{p.txn ? ` · TXN ${p.txn}` : ''}{p.enteredBy ? ` · entered by ${p.enteredBy === staff.name ? 'you' : p.enteredBy}` : ''}</small></span>{payState(p, s)}</div>)}
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
          <MgrPayFields pid={pid} oid={o.id} who={o.name} owed={lim.owed} cap={lim.cap} def={Math.max(0, bal)} today={s.today} method={sp.method === 'bank' ? 'bank' : 'cash'} elec={elec} photos={!!photoStore()} months={months.map(m => [m, fm(m)] as [string, string])} periods={{ maintenance: pMaint, electricity: pElec }} />
          <Submit className="btn primary mgr-save-btn">Save payment</Submit>
        </form>
      </ModalShell> : null}
      {rcPay ? <ReceiptLock pid={pid} oid={o.id} name={o.name} apt={o.apt} phone={o.noPhone || o.invalidPhone ? '' : o.phone || ''}
        amount={rs(rcPay.amount)} method={/bank/i.test(rcPay.method) ? 'Bank transfer' : 'Cash'} receipt={rcPay.receipt} back={base}
        period={rcPay.periodFrom ? periodText(rcPay.periodFrom, rcPay.periodTo) : ''} /> : null}
    </div>;
  });
}
