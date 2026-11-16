// The company dashboard: every project at once (the demo's viewHome).
import { requireStaff, roleName } from '@/lib/session';
import { projects as listProjects, load } from '@/lib/ops';
import { use, projStats, sortedPayments, ownerById, upcoming, collections, nextBillDate } from '@/lib/engine';
import { pendingCount } from '@/lib/manual-send';
import { KIND_LABEL } from '@/lib/approvals';
import { cookies } from 'next/headers';
import { payKey, paySeenCookie, NEW_DAYS } from '@/lib/pay-seen';
import { NeedTile, Ring, Spark, Kpi, CalBadge, Lbl, Num, initials } from '@/components/views/live';
import { LiveTabs } from '@/components/Live';
import { MONL, fm, fd, fds, dow, dowl, rs, todayPKT, addDays, diff, nowPKT, ord, hour12, short } from '@/lib/fmt';
import { Ic } from '@/components/icons';
import { Go, A, GoRow } from '@/components/client';
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
    return { key: p.id, sort: p.d + p.t, feed: <div className="lv-fi" key={p.id}><span className={`lv-av a-${'green'}`}>{initials(s.proj.name)}</span><div className="lv-fi-t"><A href={ownerHref(o)} className="apt-a">{o.apt} · {o.name}</A><small>{s.proj.name} · {when(p.d, p.t)}</small></div><span className="lv-fi-m">{viaHtml(p)}</span><b className="lv-fi-amt num">+{rs(p.amount)}</b><A href={`/?doc=receipt:${p.id}&dp=${s.project}`} className="rcpt">{p.receipt}</A></div>, row: <tr key={p.id}><td><A href={ownerHref(o)} className="apt-a">{o.apt}</A><div className="cell-sub">{s.proj.name} · {o.name}</div></td><td>{viaHtml(p)}</td><td className="r num"><b>{rs(p.amount)}</b></td><td className="cell-sub" style={{ whiteSpace: 'nowrap' }}>{when(p.d, p.t)}</td><td><A href={`/?doc=receipt:${p.id}&dp=${s.project}`} className="rcpt">{p.receipt}</A></td></tr> };
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

  // Per project: messages waiting to send, payments this person hasn't seen, collections per month, next bill day.
  const jar = await cookies();
  const per = st.map(x => use(x.s, () => {
    const since = jar.get(paySeenCookie(staff.id, x.p.id))?.value || addDays(today, -NEW_DAYS) + 'T00:00';
    const np = x.s.payments.filter(p => payKey(p) > since);
    return { id: x.p.id, send: pendingCount(), newN: np.length, newAmt: np.reduce((a, p) => a + p.amount, 0), co: collections(), next: nextBillDate(addDays(today, x.s.settings.lastRun === today ? 1 : 0)) };
  }));
  const sendN = per.reduce((a, x) => a + x.send, 0), newN = per.reduce((a, x) => a + x.newN, 0), newAmt = per.reduce((a, x) => a + x.newAmt, 0);
  const byMonth = new Map<string, number>(); per.forEach(x => x.co.forEach(([m, v]) => byMonth.set(m, (byMonth.get(m) || 0) + v)));
  const months = [...byMonth.keys()].sort().slice(-6), spark = months.map(m => byMonth.get(m) || 0);
  const nextBill = starts || per.map(x => x.next).sort()[0] || today, daysTo = Math.max(0, diff(nextBill, today));
  const r0 = st[0]?.s.settings.rules, dueDay = r0 ? +addDays(`${today.slice(0, 7)}-${String(r0.billDay).padStart(2, '0')}`, r0.dueDays).slice(8) : 10;
  const firstTodo = st.find(x => x.todo)?.p.id || live[0]?.id || '', firstSend = per.find(x => x.send)?.id || live[0]?.id || '', firstNew = per.find(x => x.newN)?.id || live[0]?.id || '';
  const hr = +nowPKT().slice(0, 2), hello = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const apvKinds = Object.entries(apvWait.reduce((a, v) => { a[KIND_LABEL[v.a.kind]] = (a[KIND_LABEL[v.a.kind]] || 0) + 1; return a; }, {} as Record<string, number>)).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(' · ');
  const sort = sp.sort === 'paid' || sp.sort === 'todo' ? sp.sort : 'out';
  const paidPct = (x: typeof st[number]) => x.sheet ? x.sheet.pct : x.pct;
  const lanes = [...st].sort((a, b) => sort === 'paid' ? paidPct(a) - paidPct(b) : sort === 'todo' ? b.todo - a.todo : b.outstanding - a.outstanding);
  const pi = (i: number) => ['amber', 'green', 'blue', 'violet'][i % 4];
  const accent = new Map(st.map((x, i) => [x.p.id, pi(i)]));
  const ringPct = y26 ? (y26.due ? 100 * y26.paid / y26.due : 0) : pct;
  const upTone = (k: string) => k === 'flag' || k === 'fine' ? 'red' : k === 'remind' ? 'amber' : k === 'bill' ? 'blue' : 'green';
  const upKind = (k: string) => k === 'bill' ? 'Bill' : k === 'remind' ? 'Reminder' : k === 'fine' ? 'Fine + notice' : k === 'flag' ? 'Flag' : 'Alert';

  const payFeed = recent.length ? <div className="lv-feed">{recent.map(r => r.feed)}</div> : <p className="empty">No payments yet.</p>;
  const waFeed = wa.length ? <div className="lv-feed">{wa.slice(0, 6).map(e => <div className="lv-fi" key={e.id}>
    <span className={`lv-av a-${e.answer === 'sent' ? 'green' : 'amber'}`}>{initials(e.staffName)}</span>
    <div className="lv-fi-t"><A href={`/p/${e.project}/apartments/${e.ownerId}`} className="apt-a">{e.apt} · {e.ownerName}</A><small>{e.title} · by {e.staffName} · {lastSeen(e.d, e.t)}</small></div>
    <span className="lv-fi-r">{e.answer === 'sent' ? <span className="tag good">Sent</span> : <span className="tag warn">Not sent</span>}</span></div>)}</div>
    : <p className="empty">Nothing this month. Messages sent from Send on WhatsApp show here with who sent them and when.</p>;

  return <>
    <div className="lv-greet"><div><div className="eyebrow-b">{dowl(today)}, {fd(today)}</div><div className="proj-title">{hello}, <span className="lv-name">{staff.name || roleName(staff)}</span></div></div>
      <div className="lv-greet-r"><span className="hchip lv-chip"><span className="live"></span>Live in {live.length} of {projs.length} projects</span><a className="btn" href="/api/export/payments?per=all"><Ic n="download" s={16} /> Export all payments</a></div></div>

    <Lbl>Needs you today</Lbl>
    <div className="lv-needs">
      <NeedTile icon="alert" tone="red" n={todo} label={todo === 1 ? 'thing to do' : 'things to do'} href={`/p/${firstTodo}/todo`} pulse sub={todo ? st.filter(x => x.todo).map(x => `${x.p.name.replace(/ Apartments.*$/, '')} ${x.todo}`).join(' · ') : 'All clear'} />
      <NeedTile icon="shield" tone="amber" n={apvWait.length} label={admin ? 'changes to approve' : 'of your changes waiting'} href="/approvals" sub={apvWait.length ? apvKinds : admin ? 'Nothing waiting for you' : apvRejected.length ? `${apvRejected.length} rejected in the last 30 days` : 'Nothing waiting'} />
      <NeedTile icon="phone" tone="green" n={sendN} label="WhatsApp to send" href={`/p/${firstSend}/send`} sub={sendN ? 'Bills, reminders and receipts' : 'Nothing waiting'} />
      <NeedTile icon="wallet" tone="blue" n={newN} label={newN === 1 ? 'new payment' : 'new payments'} href={`/p/${firstNew}/payments`} sub={newN ? `${rs(newAmt)} since you last looked` : 'No new payments'} />
    </div>

    <Lbl>Money at a glance</Lbl>
    <section className="lv-money">
      <div className="lv-money-ring"><Ring pct={ringPct} label={y26 ? '2026 PAID' : `${monName.toUpperCase()} TARGET`} tone={ringPct >= 50 ? 'green' : 'amber'} />
        <div className="lv-money-rt">{y26 ? <><b className="H"><Num v={y26.paid}>{rs(y26.paid)}</Num> paid</b><span>of {rs(y26.due)} owed for 2026 with arrears{sh.length ? ` · office sheets ${fd(sh.map(x => x.asOf || '').sort().pop()!)}` : ''}</span></>
          : <><b className="H"><Num v={coll}>{rs(coll)}</Num> collected</b><span>of the {rs(target)} {monName} target</span></>}</div></div>
      <div className="lv-kpis">
        <Kpi hl label={`Collected in ${monName}`} value={<Num v={coll}>{rs(coll)}</Num>} sub={target ? `${pct}% of the ${rs(target)} target` : `${st.reduce((a, x) => a + x.s.payments.filter(p => p.d.slice(0, 7) === mon).length, 0)} payments`}><Spark values={spark} tone="rust" /></Kpi>
        <Kpi label="Still to collect" value={<Num v={tot('outstanding')}>{rs(tot('outstanding'))}</Num>} sub={arrears && arrears >= tot('outstanding') ? 'all old arrears' : arrears ? `${rs(arrears)} old arrears` : `from ${owing} apartments`} />
        <Kpi label="Apartments owing" value={<><Num v={owing}>{owing}</Num><small> / {tot('flats')}</small></>} sub={`${tot('flagged')} flagged for disconnection`}>
          <div className="lv-bar r"><span style={{ width: `${tot('flats') ? Math.round(100 * owing / tot('flats')) : 0}%` }}></span></div></Kpi>
      </div>
      <div className="lv-next"><div className="l">{starts ? 'BILLING STARTS' : 'NEXT BILLS'}</div>
        <div className="lv-next-r"><CalBadge date={nextBill} /><div><b className="H">{daysTo === 0 ? 'Today' : daysTo === 1 ? 'Tomorrow' : <><Num v={daysTo}>{daysTo}</Num> days to go</>}</b><small>{starts ? `First bill: ${fm(st.find(x => x.firstBill === starts)?.s.goLive.slice(0, 7) || starts.slice(0, 7))}` : `${fd(nextBill)}`}{r0 ? ` · ${hour12(r0.sendHour)}` : ''}</small></div></div>
        {r0 ? <div className="lv-mini-cycle"><span><b>{ord(r0.billDay)}</b>Bill</span>{r0.remindOn.map(d => <span key={d}><b>{ord(d)}</b>Reminder</span>)}<span><b>{ord(dueDay)}</b>Due</span></div> : null}</div>
    </section>

    {!admin && apvRejected.length ? <div className="card apv-card"><div className="card-row"><h3>Rejected by an admin <small>{apvRejected.length} in the last 30 days, with the admin&apos;s note</small></h3><Go href="/approvals?s=done" className="btn sm">See all</Go></div>
      <div className="apv-list">{apvRejected.slice(0, 5).map(v => <ApprovalItem key={v.a.project + v.a.id} v={v} admin={false} meId={staff.id} back="/" />)}</div></div> : null}

    <Lbl>Projects side by side</Lbl>
    <div className="card lv-lanes">
      <div className="card-row"><h3>Maintenance by project <small>{fm(mon)}</small></h3>
        <div className="lv-seg" role="group" aria-label="Sort projects">{([['out', 'Outstanding'], ['paid', 'Paid %'], ['todo', 'To do']] as const).map(([k, l]) => <Go key={k} href={k === 'out' ? '/' : `/?sort=${k}`} replace pressed={sort === k} className={sort === k ? 'on' : ''}>{l}</Go>)}</div></div>
      <div className="lv-lane hd" aria-hidden="true"><span>Project</span><span>Outstanding</span><span>Apartments owing</span><span>{y26 ? '2026 paid' : `${monName} target`}</span><span>Billing</span><span></span></div>
      {lanes.map(x => { const pp = paidPct(x), ac = accent.get(x.p.id) || 'amber'; return <GoRow as="div" key={x.p.id} href={`/p/${x.p.id}`} className={`lv-lane click p-${ac}`}>
        <div className="lv-lane-n"><span className={`lv-pi p-${ac}`}><Ic n="building" s={19} /></span><div><b>{x.p.name}{x.todo ? <span className={`chip-t down${x.todo >= 10 ? ' hot' : ' mild'}`}>{x.todo} to do</span> : <span className="chip-t up">All clear</span>}</b><small>{x.p.place} · {x.flats} flats billed</small></div></div>
        <div data-l="Outstanding"><b className="lv-v"><Num v={x.outstanding}>{rs(x.outstanding)}</Num></b><small>{x.arrears && x.arrears >= x.outstanding ? 'all old arrears' : x.arrears ? `${rs(x.arrears)} old arrears` : x.fees ? `${rs(x.fees)} in fines` : ' '}</small></div>
        <div data-l="Apartments owing"><b className="lv-v"><Num v={x.owing}>{x.owing}</Num> <small>of {x.flats}</small></b><div className={`lv-bar ${x.owing / Math.max(1, x.flats) > .5 ? 'r' : 'a'}`}><span style={{ width: `${Math.round(100 * x.owing / Math.max(1, x.flats))}%` }}></span></div></div>
        <div data-l={y26 ? '2026 paid' : 'Target'}><b className={`lv-v ${pp >= 50 ? 'g' : 'a'}`}>{pp}%</b><div className={`lv-bar ${pp >= 50 ? 'g' : 'a'}`}><span style={{ width: `${Math.min(100, pp)}%` }}></span></div><small>{x.sheet ? `${short(x.sheet.paid)} of ${short(x.sheet.due)}` : `${short(x.coll)} of ${short(x.target)}`}</small></div>
        <div data-l="Billing">{x.firstBill ? <><b className="lv-v">{fds(x.firstBill)}</b><small>starts · {Math.max(0, diff(x.firstBill, today))} days</small></> : <><b className="lv-v">{x.flagged ? <span className="tag bad">{x.flagged} flagged</span> : 'Running'}</b><small>{rs(x.fees)} in fines</small></>}</div>
        <span className="lv-open">Open <span aria-hidden="true">→</span></span>
      </GoRow>; })}
      {off.length ? <div className="lv-off"><span>Not set up yet:</span>{off.map(p => <Go key={p.id} href={`/p/${p.id}`} className="lv-offc">+ {p.name}</Go>)}</div> : null}
    </div>

    <Lbl>What happened, what&apos;s next</Lbl>
    <div className="lv-two">
      <div className="card"><div className="card-row"><h3>Activity</h3><Go href="/log" className="btn sm">See all</Go></div>
        <LiveTabs tabs={[{ key: 'pay', label: 'Payments', badge: newN, body: payFeed }, { key: 'wa', label: 'WhatsApp', badge: waSent, body: waFeed },
          ...(admin ? [{ key: 'staff', label: 'Staff', body: <ActivityList list={accActs} staff={staffList} projects={projs} empty="Nothing yet. Payments, notes, utility bills, notices and links that accountants record show here." /> }] : [])]} /></div>
      <div className="card"><div className="card-row"><h3>Coming up</h3><span className="muted" style={{ fontSize: 12.5 }}>automatic · 14 days</span></div>
        {up.length ? <div className="lv-tl">{up.map((x, i) => <div className={`lv-ti t-${upTone(x.e.kind)}`} key={i}><div className="d">{dow(x.d)} {fd(x.d)} · {upKind(x.e.kind)}</div>
          <div className="lv-ti-r"><div><b>{x.e.text}</b><small>{x.pname}</small></div><Go href={ownerHref(x.e.o)} className="btn sm go" ariaLabel={`View ${x.e.o.name}`}>View</Go></div></div>)}</div>
          : <p className="empty">Nothing scheduled in the next 14 days.</p>}</div>
    </div>
    {modal}
  </>;
}
