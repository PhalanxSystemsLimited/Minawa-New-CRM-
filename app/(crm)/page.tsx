// The company dashboard: every project at once (the demo's viewHome).
import { requireStaff, roleName } from '@/lib/session';
import { projects as listProjects, load } from '@/lib/ops';
import { use, projStats, sortedPayments, ownerById, upcoming } from '@/lib/engine';
import { MONL, fm, fd, dow, dowl, rs, todayPKT } from '@/lib/fmt';
import { Ic } from '@/components/icons';
import { Go, A } from '@/components/client';
import { viaHtml, when, ownerHref } from '@/components/views/bits';
import { DocModal } from '@/components/views/modals';
import { ActivityList, lastSeen } from '@/components/views/activity';
import { getStore } from '@/lib/store';

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
    accActs = (await store.getLog({ staffIds: ids, limit: 40 })).filter(e => e.kind !== 'signin').slice(0, 6);
  }
  // WhatsApp sent by hand: everyone's for admins, your own for accountants.
  let wa: Awaited<ReturnType<Awaited<ReturnType<typeof getStore>>['getWaLog']>> = [];
  try { wa = await (await getStore()).getWaLog({ staffIds: staff.role === 'admin' ? null : [staff.id], limit: 200, since: today.slice(0, 8) + '01' }); } catch { wa = []; }
  const waToday = wa.filter(e => e.d === today), waSent = waToday.filter(e => e.answer === 'sent').length;
  let modal = null;
  if (sp.doc && sp.dp) { const s = states.find(x => x.project === sp.dp); if (s) modal = use(s, () => DocModal({ doc: sp.doc, flash: sp.flash })); }

  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">Dashboard</div></div><div className="crumb-path">Dashboard</div></div>
    <section className="hero"><div>
      <div className="hero-chips"><span className="hchip"><span className="live"></span>Maintenance live in {live.length} of {projs.length} projects</span></div>
      <h2>Welcome back, <span>{staff.name || roleName(staff)}</span></h2>
      <p>Across {live.length} project{live.length === 1 ? '' : 's'}, <b>{rs(tot('outstanding'))}</b> is still to collect from {owing} apartment{owing === 1 ? '' : 's'}{arrears ? <>, of which <b>{rs(arrears)}</b> is old arrears from before the system</> : null}. {target ? <>{monName}&apos;s target is <b>{rs(target)}</b> and {pct}% of it is in.</> : starts ? <>Billing starts on <b>{fd(starts)}</b>.</> : null} {y26 ? <>For 2026, <b>{rs(y26.paid)}</b> of <b>{rs(y26.due)}</b> owed (with arrears) has been paid ({y26.due ? Math.round(100 * y26.paid / y26.due) : 0}%). </> : null}{todo ? `${todo} thing${todo > 1 ? 's' : ''} need${todo > 1 ? '' : 's'} you today.` : 'Nothing needs you today.'}</p>
      <div className="hero-stats">
        <div className="hs"><div className="l">Collected in {monName}</div><div className="v num">{rs(coll)}</div></div>
        {target || !arrears ? <div className="hs"><div className="l">Of the target</div><div className="v num neon">{pct}%</div></div> : <div className="hs"><div className="l">Old arrears</div><div className="v num neon">{rs(arrears)}</div></div>}
        {y26 ? <div className="hs"><div className="l">Paid for 2026</div><div className="v num">{rs(y26.paid)}</div></div> : <div className="hs"><div className="l">Flats billed</div><div className="v num">{tot('flats')}</div></div>}
        <div className="hs"><div className="l">Flagged</div><div className="v num">{tot('flagged')}</div></div>
      </div></div>
      <div className="hero-side">
        <div className="hero-btns"><a className="btn ghost-d" href="/api/export/payments?per=all"><Ic n="download" s={16} /> Export all payments</a>{todo ? <Go href={`/p/${st.find(x => x.todo)?.p.id}/todo`} className="btn neon"><Ic n="check" s={16} /> {todo} to do</Go> : null}</div>
        <div className="hero-date">{dowl(today)}, {fd(today)}</div>
      </div>
    </section>
    <div className="sec-row"><h3 className="sec-h">Maintenance by project</h3><span className="muted">{fm(mon)}</span></div>
    <div className="pgrid">{st.map(x => (
      <div className="pcard" key={x.p.id}>
        <div className="pc-top"><span className="stat-ic"><Ic n="building" s={20} /></span><div><div className="pc-name">{x.p.name}</div><div className="cell-sub">{x.p.kind} · {x.p.place} · {x.flats} flats billed</div></div>{x.todo ? <span className="chip-t down">{x.todo} to do</span> : <span className="chip-t up">All clear</span>}</div>
        {x.firstBill && !x.target ? <div className="pc-target"><div className="l">Billing starts</div><div className="v num">{fd(x.firstBill)}</div><div className="cell-sub">First bill, for {fm(x.s.goLive.slice(0, 7))}. {rs(x.coll)} collected in {monName} against old arrears.</div></div>
          : <div className="pc-target"><div className="l">{monName} target</div><div className="v num">{rs(x.coll)} <span>of {rs(x.target)}</span></div><div className="tg-bar"><span style={{ width: `${Math.min(100, x.pct)}%` }}></span></div><div className="cell-sub">{x.pct}% collected</div></div>}
        <div className="stat-rows"><div><span>Outstanding</span><b>{rs(x.outstanding)}</b></div><div><span>Apartments owing</span><b>{x.owing}</b></div>{x.arrears ? <div title={`Owed from before ${fm(x.s.goLive.slice(0, 7))}, when the system started billing`}><span>Old arrears</span><b>{rs(x.arrears)}</b></div> : null}<div><span>Flagged for disconnection</span><b>{x.flagged}</b></div><div><span>Fines in it</span><b>{rs(x.fees)}</b></div></div>
        {x.sheet ? <div className="pc-sheet"><div className="l">2026, office sheet as on {fd(x.sheet.asOf!)}</div>
          <div className="stat-rows"><div><span>Owed for 2026 (with arrears)</span><b>{rs(x.sheet.due)}</b></div><div><span>Paid</span><b>{rs(x.sheet.paid)} <small className="muted">{x.sheet.pct}%</small></b></div>{x.sheet.since ? <div><span>of which in the CRM since</span><b>{rs(x.sheet.since)}</b></div> : null}<div><span>Still due</span><b>{rs(x.outstanding)}</b></div></div></div> : null}
        <div className="stat-foot"><Go href={`/p/${x.p.id}`} className="btn sm stat-go">Open maintenance<span aria-hidden="true">→</span></Go></div>
      </div>))}
    </div>
    <div className="dsplit">
      <div className="card"><div className="card-row"><h3>Latest payments, all projects</h3></div>
        {recent.length ? <div className="tbl-wrap"><table><thead><tr><th>Apartment</th><th>Received</th><th className="r">Amount</th><th>When</th><th>Receipt</th></tr></thead><tbody>{recent.map(r => r.row)}</tbody></table></div> : <p className="empty">No payments yet.</p>}</div>
      <div className="card"><div className="card-row"><h3>Coming up</h3><span className="muted" style={{ fontSize: 12.5 }}>automatic</span></div>
        {up.length ? <div className="list">{up.map((x, i) => <div className="li" key={i}><div className="t"><div className="a">{x.e.text}</div><div className="b">{x.pname} · {dow(x.d)} {fd(x.d)}</div></div><Go href={ownerHref(x.e.o)} className="btn sm go" ariaLabel={`View ${x.e.o.name}`}>View</Go></div>)}</div> : <p className="empty">Nothing scheduled in the next 14 days.</p>}</div>
    </div>
    {staff.role === 'admin' ? <div className="card"><div className="card-row"><h3>Accountant activity <small>latest</small></h3><Go href="/admin/activity?who=accountants" className="btn sm">See all</Go></div>
      <ActivityList list={accActs} staff={staffList} projects={projs} empty="Nothing yet. Payments, notes, utility bills, notices and links that accountants record show here." /></div> : null}
    <div className="card"><div className="card-row"><h3>WhatsApp sent by hand <small>{waSent} today{waToday.length - waSent ? `, ${waToday.length - waSent} opened but not sent` : ''} · {wa.filter(e => e.answer === 'sent').length} this month</small></h3><Go href="/whatsapp" className="btn sm">Open the log</Go></div>
      {wa.length ? <div className="tbl-wrap"><table><thead><tr><th>When</th><th>Sent by</th><th>To</th><th>Message</th><th>Answer</th></tr></thead><tbody>{wa.slice(0, 6).map(e =>
        <tr key={e.id}><td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{lastSeen(e.d, e.t)}</td><td><b>{e.staffName}</b><div className="cell-sub">{e.staffRole === 'admin' ? 'Admin' : 'Accountant'}</div></td>
          <td><A href={`/p/${e.project}/apartments/${e.ownerId}`} className="apt-a">{e.apt}</A><div className="cell-sub">{e.ownerName} · +{e.sentTo}</div></td><td>{e.title}<div className="cell-sub">Balance then {rs(e.amount)}</div></td>
          <td>{e.answer === 'sent' ? <span className="tag good">Sent</span> : <span className="tag warn">Not sent</span>}</td></tr>)}</tbody></table></div>
        : <p className="empty">Nothing this month. Messages sent from Send on WhatsApp show here with who sent them and when.</p>}</div>
    {off.length ? <div className="card"><div className="card-row"><h3>Not set up yet</h3><span className="muted" style={{ fontSize: 12.5 }}>{off.length} project{off.length === 1 ? '' : 's'}</span></div>
      <div className="offgrid">{off.map(p => <Go key={p.id} href={`/p/${p.id}`} className="offp"><b>{p.name}</b><span>{p.kind} · {p.place}</span></Go>)}</div></div> : null}
    {modal}
  </>;
}
