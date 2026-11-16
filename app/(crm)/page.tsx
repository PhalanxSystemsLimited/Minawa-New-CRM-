// The company dashboard: every project at once (the demo's viewHome).
import { HeroStatus, HeroStart, HeroStat, HeroYear } from '@/components/views/hero';
import { requireStaff, roleName } from '@/lib/session';
import { projects as listProjects, load } from '@/lib/ops';
import { use, projStats, sortedPayments, ownerById, upcoming } from '@/lib/engine';
import { MONL, fm, fd, dow, dowl, rs, todayPKT, addDays, diff } from '@/lib/fmt';
import { Ic } from '@/components/icons';
import { Go, A } from '@/components/client';
import { viaHtml, when, ownerHref } from '@/components/views/bits';
import { DocModal } from '@/components/views/modals';
import { ActivityList, lastSeen } from '@/components/views/activity';
import { getStore } from '@/lib/store';
import { ApprovalItem, type ApprovalView } from '@/components/views/approvals';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const staff = await requireStaff();
  const projs = await listProjects();
  const live = projs.filter(p => p.live), off = projs.filter(p => !p.live);
  const states = await Promise.all(live.map(p => load(p.id, staff)));
  const today = todayPKT(), mon = today.slice(0, 7), monName = MONL[+mon.slice(5) - 1];
  const st = states.map(s => use(s, () => ({ p: s.proj, s, ...projStats() })));
  const tot = (k: 'coll' | 'target' | 'todo' | 'owing' | 'outstanding' | 'flats' | 'flagged') => st.reduce((a, x) => a + x[k], 0);
  const arrears = st.reduce((a, x) => a + x.arrears, 0), starts = st.map(x => x.firstBill).filter(Boolean).sort()[0] as string | undefined;
  // The office's 2026 sheets (before the CRM): owed for the year with arrears, received (on the sheet and in the CRM since).
  const sh = st.map(x => x.sheet).filter(Boolean) as NonNullable<typeof st[number]['sheet']>[];
  const y26 = sh.length ? { due: sh.reduce((a, x) => a + x.due, 0), paid: sh.reduce((a, x) => a + x.paid, 0), balance: sh.reduce((a, x) => a + x.balance, 0) } : null;
  const coll = tot('coll'), target = tot('target'), pct = target ? Math.round(100 * coll / target) : 0, todo = tot('todo'), owing = tot('owing');
  const recent = states.flatMap(s => use(s, () => sortedPayments().slice(0, 6).map(p => {
    const o = ownerById(p.ownerId);
    return { key: p.id, sort: p.d + p.t, row: <tr key={p.id}><td><A href={ownerHref(o)} className="apt-a">{o.apt}</A><div className="cell-sub">{s.proj.name} · {o.name}</div></td><td>{viaHtml(p)}</td><td className="r num"><b>{rs(p.amount)}</b></td><td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{when(p.d, p.t)}</td><td><A href={`/?doc=receipt:${p.id}&dp=${s.project}`} className="rcpt">{p.receipt}</A></td></tr> };
  }))).sort((a, b) => b.sort.localeCompare(a.sort)).slice(0, 6);
  const oNum = (id: string) => +id.replace(/\D/g, '');
  const up = states.flatMap(s => use(s, () => upcoming(14, 6).map(x => ({ ...x, pname: s.proj.name })))).sort((a, b) => a.d.localeCompare(b.d) || oNum(a.e.o.id) - oNum(b.e.o.id)).slice(0, 6);
  // Admins see what the accountants have been doing.
  let accActs: Awaited<ReturnType<Awaited<ReturnType<typeof getStore>>['getLog']>> = [], staffList: Awaited<ReturnType<Awaited<ReturnType<typeof getStore>>['listStaff']>> = [];
  if (staff.role === 'admin') {
    const store = await getStore(); staffList = await store.listStaff();
    const ids = staffList.filter(x => x.role === 'accountant').map(x => x.id);
    accActs = (await store.getLog({ staffIds: ids, limit: 40 })).filter(e => !['signin', 'signout'].includes(e.kind)).slice(0, 6);
  }
  // WhatsApp sent by hand: everyone's for admins, your own for accountants.
  let wa: Awaited<ReturnType<Awaited<ReturnType<typeof getStore>>['getWaLog']>> = [];
  try { wa = await (await getStore()).getWaLog({ staffIds: staff.role === 'admin' ? null : [staff.id], limit: 200, since: today.slice(0, 8) + '01' }); } catch { wa = []; }
  const waToday = wa.filter(e => e.d === today), waSent = waToday.filter(e => e.answer === 'sent').length;
  // Approvals: accountants' changes to owners' charges. Admins see what waits for them; accountants their own requests.
  const admin = staff.role === 'admin';
  const apv: ApprovalView[] = states.flatMap(s => use(s, () => s.approvals.filter(a => admin || a.byId === staff.id)
    .map(a => { const o = a.ownerId ? ownerById(a.ownerId) : null; return { a, apt: o?.apt || '', owner: o?.name || '', pname: s.proj.name }; })));
  const apvWait = apv.filter(v => v.a.status === 'pending').sort((x, y) => (x.a.d + x.a.t).localeCompare(y.a.d + y.a.t));
  const byDecided = (x: ApprovalView, y: ApprovalView) => ((y.a.decidedD || '') + y.a.decidedT).localeCompare((x.a.decidedD || '') + x.a.decidedT);
  // Accountants: what an admin rejected (with the admin's note) in the last 30 days, and the rest of their requests.
  const apvRejected = admin ? [] : apv.filter(v => v.a.status === 'rejected' && (v.a.decidedD || '') >= addDays(today, -29)).sort(byDecided);
  const apvMine = admin ? [] : [...apvWait, ...apv.filter(v => v.a.status === 'approved' && (v.a.decidedD || '') >= addDays(today, -13)).sort(byDecided)].slice(0, 5);
  let modal = null;
  if (sp.doc && sp.dp) { const s = states.find(x => x.project === sp.dp); if (s) modal = use(s, () => DocModal({ doc: sp.doc, flash: sp.flash })); }

  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">Dashboard</div></div><div className="crumb-path">Dashboard</div></div>
    <section className="hero"><div>
      <div className="hero-chips"><span className="hchip"><span className="live"></span>Maintenance live in {live.length} of {projs.length} projects</span>{admin && apvWait.length ? <Go href="/approvals" className="hchip apv-chip">{apvWait.length} change{apvWait.length === 1 ? '' : 's'} waiting for your approval</Go> : null}</div>
      <h2>Welcome back, <span>{staff.name || roleName(staff)}</span></h2>
      <HeroStatus todo={todo} href={`/p/${st.find(x => x.todo)?.p.id || live[0]?.id || ''}/todo`} />
      {!target && starts ? <HeroStart date={starts} month={st.find(x => x.firstBill === starts)?.s.goLive.slice(0, 7) || starts.slice(0, 7)} today={today} extra={`${live.length} project${live.length === 1 ? '' : 's'}`} /> : null}
      <div className="hero-stats">
        <HeroStat label={`Collected in ${monName}`} value={rs(coll)} sub={target ? `${pct}% of the ${rs(target)} target` : undefined} neon />
        <HeroStat label="Still to collect" value={rs(tot('outstanding'))} sub={arrears && arrears >= tot('outstanding') ? 'all old arrears' : arrears ? `${rs(arrears)} old arrears` : undefined} />
        <HeroStat label="Apartments owing" value={owing} sub={`of ${tot('flats')} billed`} />
        <HeroStat label="Flagged" value={tot('flagged')} sub="for disconnection" />
      </div>
      {y26 ? <HeroYear paid={y26.paid} due={y26.due} asOf={sh.map(x => x.asOf || '').sort().pop() || null} /> : null}
      </div>
      <div className="hero-side">
        <div className="hero-btns"><a className="btn ghost-d" href="/api/export/payments?per=all"><Ic n="download" s={16} /> Export all payments</a></div>
        <div className="hero-date">{dowl(today)}, {fd(today)}</div>
      </div>
    </section>
    {admin && apvWait.length ? <div className="card apv-card"><div className="card-row"><h3>Waiting for your approval <small>{apvWait.length} change{apvWait.length === 1 ? '' : 's'} an accountant asked for</small></h3><Go href="/approvals" className="btn sm">See all</Go></div>
      <p className="cell-sub" style={{ margin: '0 0 12px' }}>These changes to what owners are charged apply only when you approve them.</p>
      <div className="apv-list">{apvWait.slice(0, 5).map(v => <ApprovalItem key={v.a.project + v.a.id} v={v} admin meId={staff.id} back="/" />)}</div>
      {apvWait.length > 5 ? <div style={{ marginTop: 10 }}><Go href="/approvals" className="btn sm">{apvWait.length - 5} more waiting</Go></div> : null}</div> : null}
    {!admin && apvRejected.length ? <div className="card apv-card"><div className="card-row"><h3>Rejected by an admin <small>{apvRejected.length} in the last 30 days, with the admin&apos;s note</small></h3><Go href="/approvals?s=done" className="btn sm">See all</Go></div>
      <div className="apv-list">{apvRejected.slice(0, 5).map(v => <ApprovalItem key={v.a.project + v.a.id} v={v} admin={false} meId={staff.id} back="/" />)}</div></div> : null}
    {!admin && apvMine.length ? <div className="card apv-card"><div className="card-row"><h3>Your change requests <small>{apvWait.length ? `${apvWait.length} waiting for an admin` : 'approved in the last 14 days'}</small></h3><Go href="/approvals" className="btn sm">See all</Go></div>
      <div className="apv-list">{apvMine.map(v => <ApprovalItem key={v.a.project + v.a.id} v={v} admin={false} meId={staff.id} back="/" />)}</div></div> : null}
    <div className="sec-row"><h3 className="sec-h">Maintenance by project</h3><span className="muted">{fm(mon)}</span></div>
    <div className="pgrid">{st.map(x => (
      <div className="pcard" key={x.p.id}>
        <div className="pc-top"><span className="stat-ic"><Ic n="building" s={20} /></span><div><div className="pc-name">{x.p.name}</div><div className="cell-sub">{x.p.kind} · {x.p.place} · {x.flats} flats billed</div></div>{x.todo ? <span className={`chip-t down${x.todo >= 10 ? ' hot' : ' mild'}`}>{x.todo} to do</span> : <span className="chip-t up">All clear</span>}</div>
        {x.firstBill ? <div className="pc-target"><div className="l">Billing starts</div><div className="v num">{fd(x.firstBill)}</div><div className="cell-sub">For {fm(x.s.goLive.slice(0, 7))} · {Math.max(0, diff(x.firstBill, today))} days to go</div></div>
          : <div className="pc-target"><div className="l">{monName} target</div><div className="v num">{rs(x.coll)} <span>of {rs(x.target)}</span></div><div className="tg-bar"><span style={{ width: `${Math.min(100, x.pct)}%` }}></span></div><div className="cell-sub">{x.pct}% collected</div></div>}
        <div className="stat-rows"><div className="big"><span>Outstanding</span><b>{rs(x.outstanding)}</b></div><div><span>Apartments owing</span><b>{x.owing}</b></div>{x.arrears ? <div title={`Owed from before ${fm(x.s.goLive.slice(0, 7))}, when the system started billing`}><span>Old arrears</span><b>{rs(x.arrears)}</b></div> : null}<div><span>Flagged for disconnection</span><b>{x.flagged}</b></div><div><span>Fines in it</span><b>{rs(x.fees)}</b></div></div>
        {x.sheet ? <div className="pc-sheet"><div className="l">2026, office sheet as on {fd(x.sheet.asOf!)}</div>
          <div className="stat-rows">
            <div><span>Owed for 2026 <i>(with arrears)</i></span><b>{rs(x.sheet.due)}</b></div>
            <div className="paid"><span>Paid</span><b>{rs(x.sheet.paid)} <small className={x.sheet.pct >= 50 ? 'good' : 'warn'}>{x.sheet.pct}%</small></b></div>
            <div className={`pc-bar ${x.sheet.pct >= 50 ? 'good' : 'warn'}`} role="img" aria-label={`${x.sheet.pct}% of 2026 paid`}><span style={{ width: `${Math.min(100, x.sheet.pct)}%` }}></span></div>
            <div className="small"><span>of which in the CRM since</span><b>{x.sheet.since ? rs(x.sheet.since) : '—'}</b></div>
            <div className="due"><span>Still due</span><b>{rs(x.outstanding)}</b></div>
          </div></div> : null}
        <div className="stat-foot"><Go href={`/p/${x.p.id}`} className="btn sm stat-go">Open maintenance<span aria-hidden="true">→</span></Go></div>
      </div>))}
    </div>
    <div className="dsplit">
      <div className="card"><div className="card-row"><h3>Latest payments, all projects</h3></div>
        {recent.length ? <div className="tbl-wrap"><table className="dpay-tbl"><thead><tr><th>Apartment</th><th>Received</th><th className="r">Amount</th><th>When</th><th>Receipt</th></tr></thead><tbody>{recent.map(r => r.row)}</tbody></table></div> : <p className="empty">No payments yet.</p>}</div>
      <div className="card"><div className="card-row"><h3>Coming up</h3><span className="muted" style={{ fontSize: 12.5 }}>automatic</span></div>
        {up.length ? <div className="list">{up.map((x, i) => <div className="li" key={i}><div className="t"><div className="a">{x.e.text}</div><div className="b">{x.pname} · {dow(x.d)} {fd(x.d)}</div></div><Go href={ownerHref(x.e.o)} className="btn sm go" ariaLabel={`View ${x.e.o.name}`}>View</Go></div>)}</div> : <p className="empty">Nothing scheduled in the next 14 days.</p>}</div>
    </div>
    {staff.role === 'admin' ? <div className="card"><div className="card-row"><h3>Accountant activity <small>latest</small></h3><Go href="/log?who=accountants" className="btn sm">See all</Go></div>
      <ActivityList list={accActs} staff={staffList} projects={projs} empty="Nothing yet. Payments, notes, utility bills, notices and links that accountants record show here." /></div> : null}
    <div className="card"><div className="card-row"><h3>WhatsApp sent by hand <small>{waSent} today{waToday.length - waSent ? `, ${waToday.length - waSent} opened but not sent` : ''} · {wa.filter(e => e.answer === 'sent').length} this month</small></h3><Go href="/whatsapp" className="btn sm">Open the log</Go></div>
      {wa.length ? <div className="tbl-wrap"><table className="dwa-tbl"><thead><tr><th>When</th><th>Sent by</th><th>To</th><th>Message</th><th>Answer</th></tr></thead><tbody>{wa.slice(0, 6).map(e =>
        <tr key={e.id}><td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{lastSeen(e.d, e.t)}</td><td><b>{e.staffName}</b><div className="cell-sub">{e.staffRole === 'admin' ? 'Admin' : 'Accountant'}</div></td>
          <td><A href={`/p/${e.project}/apartments/${e.ownerId}`} className="apt-a">{e.apt}</A><div className="cell-sub">{e.ownerName} · +{e.sentTo}</div></td><td>{e.title}<div className="cell-sub">Balance then {rs(e.amount)}</div></td>
          <td>{e.answer === 'sent' ? <span className="tag good">Sent</span> : <span className="tag warn">Not sent</span>}</td></tr>)}</tbody></table></div>
        : <p className="empty">Nothing this month. Messages sent from Send on WhatsApp show here with who sent them and when.</p>}</div>
    {off.length ? <div className="card"><div className="card-row"><h3>Not set up yet</h3><span className="muted" style={{ fontSize: 12.5 }}>{off.length} project{off.length === 1 ? '' : 's'}</span></div>
      <div className="offgrid">{off.map(p => <Go key={p.id} href={`/p/${p.id}`} className="offp"><b>{p.name}</b><span>{p.kind} · {p.place}</span></Go>)}</div></div> : null}
    {modal}
  </>;
}
