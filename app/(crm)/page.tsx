// The company dashboard: every project at once (the demo's viewHome).
import { requireStaff, roleName } from '@/lib/session';
import { projects as listProjects, load } from '@/lib/ops';
import { duesList } from '@/lib/reports';
import { buildingStats } from '@/lib/stats';
import { use, projStats, sortedPayments, ownerById, upcoming, collections, nextBillOf } from '@/lib/engine';
import { pendingCount } from '@/lib/manual-send';
import { KIND_LABEL } from '@/lib/approvals';
import { cookies } from 'next/headers';
import { payKey, paySeenCookie, NEW_DAYS } from '@/lib/pay-seen';
import { projectTasks, myTasks } from '@/lib/tasks';
import { NeedTile, Ring, Spark, Kpi, CalBadge, Lbl, Num, initials, Stack } from '@/components/views/live';
import { LiveTabs } from '@/components/Live';
import { MONL, fm, fd, fds, dow, dowl, rs, todayPKT, addDays, diff, nowPKT, ord, hour12, short } from '@/lib/fmt';
import { Ic, IcTile } from '@/components/icons';
import { Empty, BuildingArt } from '@/components/views/art';
import { Go, A, GoRow } from '@/components/client';
import { viaHtml, when, ownerHref } from '@/components/views/bits';
import { DocModal } from '@/components/views/modals';
import { ActivityList, lastSeen } from '@/components/views/activity';
import { getStore } from '@/lib/store';
import { ManagerHome } from '@/components/views/manager';
import { reportsToAcc } from '@/lib/people';
import { ApprovalItem, type ApprovalView } from '@/components/views/approvals';
import { fmtNumber, freeAt, validNumber } from '@/lib/wa-numbers';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const staff = await requireStaff();
  // 25 Nov 2026: a building manager's whole screen is his customer list, the money box and Add payment.
  if (staff.role === 'manager') return <ManagerHome staff={staff} sp={sp} />;
  const projs = await listProjects(staff);
  const live = projs.filter(p => p.live), off = projs.filter(p => !p.live);
  const states = await Promise.all(live.map(p => load(p.id, staff)));
  const today = todayPKT(), mon = today.slice(0, 7), monName = MONL[+mon.slice(5) - 1];
  const st = states.map(s => use(s, () => ({ p: s.proj, s, ...projStats() })));
  const tot = (k: 'coll' | 'target' | 'todo' | 'owing' | 'outstanding' | 'flats' | 'flagged') => st.reduce((a, x) => a + x[k], 0);
  const arrears = st.reduce((a, x) => a + x.arrears, 0), fees = st.reduce((a, x) => a + (x.fees || 0), 0), starts = st.map(x => x.firstBill).filter(Boolean).sort()[0] as string | undefined;
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
  {
    // Admins: accountants and building managers. Accountants: the building managers (their own is under Activity).
    const store = await getStore(); staffList = await store.listStaff();
    const ids = staffList.filter(x => (x.role === 'manager' && (staff.role === 'admin' || reportsToAcc(x, staff.id))) || (staff.role === 'admin' && x.role === 'accountant')).map(x => x.id);
    accActs = (await store.getLog({ staffIds: ids, limit: 40 })).filter(e => !['signin', 'signout'].includes(e.kind)).slice(0, 6);
  }
  // WhatsApp sent by hand: everyone's for admins, your own for accountants.
  let wa: Awaited<ReturnType<Awaited<ReturnType<typeof getStore>>['getWaLog']>> = [];
  try { wa = await (await getStore()).getWaLog({ staffIds: staff.role === 'admin' ? null : staff.role === 'accountant' ? [staff.id, ...staffList.filter(x => x.role === 'manager' && reportsToAcc(x, staff.id)).map(x => x.id)] : [staff.id], limit: 200, since: today.slice(0, 8) + '01' }); } catch { wa = []; }
  // The WhatsApp tab's counter: messages sent today since this person last opened the tab (kept in a cookie).
  const waSeenName = `mwa_${staff.id.replace(/[^a-z0-9-]/gi, '')}`, waSeen = decodeURIComponent((await cookies()).get(waSeenName)?.value || '');
  const waToday = wa.filter(e => e.d === today), waSent = waToday.filter(e => e.answer === 'sent' && (e.at || '') > waSeen).length;
  const waLatest = wa.reduce((m, e) => (e.at || '') > m ? e.at || '' : m, waSeen);
  // Approvals: accountants' changes to owners' charges. Admins see what waits for them; accountants their own requests.
  const admin = staff.role === 'admin';
  const apv: ApprovalView[] = states.flatMap(s => use(s, () => s.approvals.filter(a => admin || a.byId === staff.id)
    .map(a => { const o = a.ownerId ? ownerById(a.ownerId) : null; return { a, apt: o?.apt || '', owner: o?.name || '', pname: s.proj.name }; })));
  const apvWait = apv.filter(v => v.a.status === 'pending').sort((x, y) => (x.a.d + x.a.t).localeCompare(y.a.d + y.a.t));
  const byDecided = (x: ApprovalView, y: ApprovalView) => ((y.a.decidedD || '') + y.a.decidedT).localeCompare((x.a.decidedD || '') + x.a.decidedT);
  // Accountants: what an admin rejected (with the admin's note) in the last 30 days, and the rest of their requests.
  const apvRejected = admin ? [] : apv.filter(v => v.a.status === 'rejected' && (v.a.decidedD || '') >= addDays(today, -29)).sort(byDecided);
  const apvMine = admin ? [] : [...apvWait, ...apv.filter(v => v.a.status === 'approved' && (v.a.decidedD || '') >= addDays(today, -13)).sort(byDecided)].slice(0, 5);
  // WhatsApp numbers and their daily limits (20 Nov 2026): the Admin sees every number; others their own.
  let waCard: React.ReactNode = null;
  try {
    const store = await getStore(), people = staff.role === 'admin' ? (staffList.length ? staffList : await store.listStaff()) : [staff];
    const nums = new Map<string, { number: string; limit: number; who: string[] }>();
    for (const x of people) for (const n of x.waNumbers || []) if (n.active && x.active && validNumber(n.number)) { const r = nums.get(n.number) || { number: n.number, limit: n.limit, who: [] }; r.limit = Math.min(r.limit, n.limit); r.who.push(x.name); nums.set(n.number, r); }
    if (nums.size && staff.role !== 'accountant') {
      const use = await store.waUsage([...nums.values()].map(r => ({ number: r.number, limit: r.limit })));
      waCard = <div className="card lv-wa"><div className="card-row"><h3>WhatsApp today <small>customers in the last 24 hours</small></h3>{staff.role === 'admin' ? <Go href="/admin#wa" className="btn sm">Numbers</Go> : null}</div>
        {[...nums.values()].map(r => { const u = use.find(x => x.number === r.number), lim = r.limit + (u?.extra || 0), used = u?.used || 0, pc = Math.min(100, Math.round(100 * used / Math.max(1, lim)));
          return <div className="wa-use-row" key={r.number}><div className="t"><b className="num">{fmtNumber(r.number)}</b><span className="cell-sub">{staff.role === 'admin' ? r.who.join(', ') : 'your number'}{pc >= 100 && u?.nextFree ? ` · next place at ${freeAt(u.nextFree)}` : ''}</span></div>
            <div className="wa-use"><span className={'wa-use-bar' + (pc >= 100 ? ' full' : pc >= 80 ? ' near' : '')}><i style={{ width: `${pc}%` }}></i></span><b className="num">{used}/{lim}</b></div></div>; })}
      </div>;
    }
  } catch (e) { console.error('wa usage', (e as Error).message); }
  let modal = null;
  if (sp.doc && sp.dp) { const s = states.find(x => x.project === sp.dp); if (s) modal = use(s, () => DocModal({ doc: sp.doc, flash: sp.flash })); }

  // Per project: messages waiting to send, payments this person hasn't seen, collections per month, next bill day.
  const jar = await cookies();
  const per = st.map(x => use(x.s, () => {
    const since = jar.get(paySeenCookie(staff.id, x.p.id))?.value || addDays(today, -NEW_DAYS) + 'T00:00';
    const np = x.s.payments.filter(p => payKey(p) > since);
    return { id: x.p.id, send: pendingCount(), newN: np.length, newAmt: np.reduce((a, p) => a + p.amount, 0), co: collections(), next: nextBillOf(x.s.owners, addDays(today, x.s.settings.lastRun === today ? 1 : 0)) };
  }));
  const sendN = per.reduce((a, x) => a + x.send, 0), newN = per.reduce((a, x) => a + x.newN, 0), newAmt = per.reduce((a, x) => a + x.newAmt, 0);
  const byMonth = new Map<string, number>(); per.forEach(x => x.co.forEach(([m, v]) => byMonth.set(m, (byMonth.get(m) || 0) + v)));
  const months = [...byMonth.keys()].sort().slice(-6), spark = months.map(m => byMonth.get(m) || 0);
  const nextBill = starts || per.map(x => x.next).sort()[0] || today, daysTo = Math.max(0, diff(nextBill, today));
  const r0 = st[0]?.s.settings.rules, dueDay = r0 ? r0.dueDays : 15;
  const firstTodo = st.find(x => x.todo)?.p.id || live[0]?.id || '', firstSend = per.find(x => x.send)?.id || live[0]?.id || '', firstNew = per.find(x => x.newN)?.id || live[0]?.id || '';
  // The three To do lists (lib/tasks.ts): managers' work, accountants' work, and this person's own.
  const allT = states.flatMap(s => projectTasks(s)), accT = allT.filter(t => t.role === 'accountant'), myT = myTasks(allT, staff);
  const lateN = (l: typeof allT) => l.filter(t => t.overdue).length;
  const hr = +nowPKT().slice(0, 2), hello = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const apvKinds = Object.entries(apvWait.reduce((a, v) => { a[KIND_LABEL[v.a.kind]] = (a[KIND_LABEL[v.a.kind]] || 0) + 1; return a; }, {} as Record<string, number>)).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(' · ');
  const sort = sp.sort === 'paid' || sp.sort === 'todo' ? sp.sort : 'out';
  const paidPct = (x: typeof st[number]) => x.sheet ? x.sheet.pct : x.pct;
  const lanes = [...st].sort((a, b) => sort === 'paid' ? paidPct(a) - paidPct(b) : sort === 'todo' ? b.todo - a.todo : b.outstanding - a.outstanding);
  const pi = (i: number) => ['amber', 'green', 'blue', 'violet'][i % 4];
  const accent = new Map(st.map((x, i) => [x.p.id, pi(i)]));
  const ringPct = y26 ? (y26.due ? 100 * y26.paid / y26.due : 0) : pct;
  const upTone = (k: string) => k === 'flag' || k === 'fine' ? 'red' : k === 'remind' ? 'amber' : k === 'bill' ? 'blue' : 'green';
  const upKind = (k: string) => k === 'bill' ? 'Bill' : k === 'remind' ? 'Reminder' : k === 'fine' ? 'Late warning' : k === 'flag' ? 'Discontinued' : 'Alert';

  const payFeed = recent.length ? <div className="lv-feed">{recent.map(r => r.feed)}</div> : <Empty kind="pay" small title="No payments yet">Payments show here as they are entered and approved.</Empty>;
  const waFeed = wa.length ? <div className="lv-feed">{wa.slice(0, 6).map(e => <div className="lv-fi" key={e.id}>
    <span className={`lv-av a-${e.answer === 'sent' ? 'green' : 'amber'}`}>{initials(e.staffName)}</span>
    <div className="lv-fi-t"><A href={`/p/${e.project}/apartments/${e.ownerId}`} className="apt-a">{e.apt} · {e.ownerName}</A><small>{e.title} · by {e.staffName} · {lastSeen(e.d, e.t)}</small></div>
    <span className="lv-fi-r">{e.answer === 'sent' ? <span className="tag good">Sent</span> : <span className="tag warn">Not sent</span>}</span></div>)}</div>
    : <Empty kind="send" small title="Nothing sent this month">Messages sent from Send on WhatsApp show here with who sent them and when.</Empty>;

  // Past due: after the money and the buildings; the Accountant can send a reminder straight away.
  const pastDue = (() => {
      // Past due (Phase 2): customers whose bill (or old arrears) is past its due date, worst first. The building manager
      // (the Accountant) can send a reminder straight away; others open the customer.
      const late = duesList(states, true).slice(0, 8), all = duesList(states, true).length;
      if (!late.length) return null;
      return <><Lbl>Past due</Lbl>
        <div className="card"><div className="card-row"><h3>Past their due date <small>{all} customer{all === 1 ? '' : 's'} · worst first</small></h3><A href="/reports?o=1" className="btn sm">See all</A></div>
          <div className="tbl-wrap"><table><thead><tr><th>Apartment</th><th>Customer</th><th>Building</th><th className="r">Owed</th><th>Due date</th><th></th></tr></thead><tbody>
            {late.map(x => <tr key={x.project + x.ownerId}><td><A href={`/p/${x.project}/apartments/${x.ownerId}`} className="apt-a"><b>{x.apt}</b></A></td><td>{x.name}</td><td>{x.pname}</td>
              <td className="r num"><b>{rs(x.total)}</b>{x.fine ? <div className="cell-sub">incl. fine {rs(x.fine)}</div> : null}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{x.oldestDue ? fds(x.oldestDue) : '—'}<div className="cell-sub">{x.daysOver} day{x.daysOver === 1 ? '' : 's'} late{x.status === 'flagged' ? ' · discontinued' : ''}</div></td>
              <td className="r">{staff.role === 'accountant' && x.phone ? <A href={`/p/${x.project}/send?type=reminder&ids=${x.ownerId}&go=1`} className="btn sm wa">Send reminder</A> : <A href={`/p/${x.project}/apartments/${x.ownerId}`} className="btn sm">Open</A>}</td></tr>)}
          </tbody></table></div></div></>;
    })();

  return <>
    <div className="lv-greet"><div><div className="eyebrow-b">{dowl(today)}, {fd(today)}</div><div className="proj-title">{hello}, <span className="lv-name">{staff.name || roleName(staff)}</span></div></div>
      <div className="lv-greet-r"><span className="hchip lv-chip"><span className="live"></span>Live in {live.length} of {projs.length} projects</span><a className="btn" href="/api/export/payments?per=all"><Ic n="download" s={16} /> Export all payments</a></div></div>

    <Lbl>Needs you today</Lbl>
    <div className="lv-needs">
      {staff.role === 'admin' ? <>
        <NeedTile title="Approvals" icon="shieldok" tone="amber" n={apvWait.length} label="changes to approve" href="/approvals" pulse sub={apvWait.length ? apvKinds : 'Nothing waiting for you'} />
        <NeedTile title="Accountants" icon="coins" tone="green" n={accT.length} label={accT.length === 1 ? 'task open' : 'tasks open'} href="/tasks" sub={accT.length ? `${lateN(accT)} late · ${sendN} owner${sendN === 1 ? '' : 's'} to message` : 'All clear'} />
      </> : <>
        <NeedTile title="To do" icon="clip" tone="red" n={myT.length} label={myT.length === 1 ? 'thing to do' : 'things to do'} href="/tasks" pulse sub={myT.length ? `${lateN(myT)} late · entries, receipts, follow-ups` : 'All clear'} />
        <NeedTile title="WhatsApp" icon="send" tone="green" n={sendN} label="WhatsApp to send" href={`/p/${firstSend}/send`} sub={sendN ? 'Bills, reminders, notices, receipts' : 'Nothing waiting'} />
        <NeedTile title="Approvals" icon="shieldok" tone="amber" n={apvWait.length} label="of your changes waiting" href="/approvals" sub={apvWait.length ? apvKinds : apvRejected.length ? `${apvRejected.length} rejected in the last 30 days` : 'Nothing waiting'} />
      </>}
      <NeedTile title="Payments" icon="cash" tone="blue" n={newN} label={newN === 1 ? 'new payment' : 'new payments'} href={`/p/${firstNew}/payments`} sub={newN ? `${rs(newAmt)} since you last looked` : 'No new payments'} />
    </div>
    {(() => {
      // Customers with no possession date (due on the 1st until one is added), for the person's buildings: a slim notice.
      const per = states.map(s => ({ p: s.proj, n: s.owners.filter(o => o.status === 'active' && !o.possessionKnown).length })).filter(x => x.n), n = per.reduce((a, x) => a + x.n, 0);
      if (!n) return null;
      return <div className="strip nopos-card" data-tone="violet"><IcTile n="key" tone="violet" />
        <div className="strip-t"><b>{n} customer{n === 1 ? '' : 's'} with no possession date</b><span>Due on the 1st until a date is added · {per.map(x => `${x.p.name}: ${x.n}`).join(' · ')}{staff.role === 'admin' ? '' : ' · your dates go to the Admin for approval'}</span></div>
        <A href="/possession" className="btn sm primary"><Ic n="plus" s={14} /> Add possession dates</A></div>;
    })()}
    <div className="lv-layout lv-dash">
    <div className="lv-main">
    <Lbl>Money at a glance</Lbl>
    <section className="lv-money">
      <div className="lv-money-ring"><Ring pct={ringPct} label={y26 ? '2026 PAID' : `${monName.toUpperCase()} TARGET`} tone={ringPct >= 50 ? 'green' : 'amber'} />
        <div className="lv-money-rt">{y26 ? <><b className="H"><Num v={y26.paid}>{rs(y26.paid)}</Num> paid</b><span>of {rs(y26.due)} owed for 2026 with arrears{sh.length ? ` · office sheets ${fd(sh.map(x => x.asOf || '').sort().pop()!)}` : ''}</span></>
          : <><b className="H"><Num v={coll}>{rs(coll)}</Num> collected</b><span>of the {rs(target)} {monName} target</span></>}</div></div>
      <div className="lv-kpis">
        <Kpi hl icon="trend" tone="green" label={`Collected in ${monName}`} value={<Num v={coll}>{rs(coll)}</Num>} sub={target ? `${pct}% of the ${rs(target)} target` : `${st.reduce((a, x) => a + x.s.payments.filter(p => p.d.slice(0, 7) === mon).length, 0)} payments`}><Spark values={spark} tone="rust" /></Kpi>
        <Kpi icon="wallet" tone="amber" label="Still to collect" value={<Num v={tot('outstanding')}>{rs(tot('outstanding'))}</Num>} sub={arrears && arrears >= tot('outstanding') ? 'all old arrears' : arrears ? `${rs(arrears)} old arrears` : `from ${owing} apartments`}>
          <Stack parts={[{ v: arrears, label: 'Old arrears', tone: 'amber' }, { v: Math.max(0, tot('outstanding') - arrears - fees), label: 'Bills', tone: 'rust' }, { v: fees, label: 'Fines', tone: 'red' }]} /></Kpi>
        <Kpi icon="building" tone="blue" label="Apartments owing" value={<><Num v={owing}>{owing}</Num><small> / {tot('flats')}</small></>} sub={`${tot('flagged')} flagged for disconnection`}>
          <div className="lv-bar r"><span style={{ width: `${tot('flats') ? Math.round(100 * owing / tot('flats')) : 0}%` }}></span></div></Kpi>
      </div>
      <div className="lv-next"><div className="l">{starts ? 'BILLING STARTS' : 'NEXT BILLS'}</div>
        <div className="lv-next-r"><CalBadge date={nextBill} /><div><b className="H">{daysTo === 0 ? 'Today' : daysTo === 1 ? 'Tomorrow' : <><Num v={daysTo}>{daysTo}</Num> days to go</>}</b><small>{starts ? `Statements of dues · monthly charges from ${fm(st.find(x => x.firstBill === starts)?.s.goLive.slice(0, 7) || starts.slice(0, 7))}` : `${fd(nextBill)}`}{r0 ? ` · ${hour12(r0.sendHour)}` : ''}</small></div></div>
        {r0 ? <div className="lv-mini-cycle" title="Each customer is billed on their own billing date; due on the 15th of the next month"><span><b>Own</b>Bill date</span>{r0.remindOn.map(d => <span key={d}><b>{ord(d)}</b>Reminder</span>)}<span><b>{ord(dueDay)}</b>Due</span></div> : null}</div>
    </section>

    {(() => {
      // Per building (Phase 4): the buildings this person looks after, the Admin every building.
      const bs = states.map(s => buildingStats(s, staff));
      if (!bs.length) return null;
      const row = (l: string, v: string, sub?: string, tone?: string) => <div className="bs-r"><span className="bs-l">{l}</span><span className={`bs-v num${tone ? ' ' + tone : ''}`}>{v}{sub ? <small>{sub}</small> : null}</span></div>;
      return <><Lbl>{staff.role === 'admin' ? 'Buildings this month' : 'Your buildings this month'}</Lbl>
        <div className="bs-grid">{bs.map(b => <div className="card bs-card" key={b.pid}>
          <div className="bs-top"><BuildingArt seed={b.pid} />
            <div className="bs-name"><A href={`/p/${b.pid}`}>{b.name}</A><small>{b.active} customers{b.vacant ? ` · ${b.vacant} vacant` : ''}</small></div></div>
          {(() => { const pc = b.billed ? Math.min(100, Math.round(100 * b.collected / b.billed)) : 0; return <div className="bs-prog" title="Collected this month, of what was billed this month">
            <div className="bs-prog-h"><span>Collected of billed</span><b className="num">{b.billed ? `${pc}%` : '—'}</b></div>
            <div className={`bs-bar ${pc >= 50 ? 'g' : 'a'}`}><span style={{ width: `${pc}%` }}></span></div></div>; })()}
          {row('Billed', rs(b.billed), `${b.nBills} bill${b.nBills === 1 ? '' : 's'}`)}
          {row('Collected', rs(b.collected), b.nPays ? `cash ${short(b.cash)} · bank ${short(b.bank)}` : 'none yet', 'good')}
          {b.nPending ? row('Accountant to confirm', rs(b.pending), `of it · ${b.nPending} entr${b.nPending === 1 ? 'y' : 'ies'}`, 'warn') : null}
          {row('Still to collect', rs(b.toCollect), `${b.owing} customer${b.owing === 1 ? '' : 's'}`)}
          {row('Past due', rs(b.pastDue), `${b.nPastDue} customer${b.nPastDue === 1 ? '' : 's'}`, b.nPastDue ? 'bad' : '')}
          {b.elec ? row('Electricity', `${rs(b.elec.collected)} of ${rs(b.elec.billed)}`, `unpaid ${short(b.elec.unpaid)}`) : null}
          {b.gen ? row('Generator', rs(b.gen.billed), `${b.gen.flats} flat${b.gen.flats === 1 ? '' : 's'} on the list`) : null}
          {b.noPos ? row('No possession date', String(b.noPos), 'due on the 1st', 'warn') : null}
          {b.requests ? row(staff.role === 'admin' ? 'Requests to decide' : 'Your requests waiting', String(b.requests)) : null}
          <div className="bs-acts"><A href={`/reports?r=month&p=${b.pid}`} className="btn sm"><Ic n="chart" s={14} /> Monthly report</A><A href={`/reports?o=1&p=${b.pid}`} className="btn sm"><Ic n="alert" s={14} /> Defaulters</A></div>
        </div>)}</div></>;
    })()}
    {pastDue}
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

    <Lbl>What&apos;s next</Lbl>
    <div className="card lv-upc"><div className="card-row"><h3>Coming up</h3><span className="muted" style={{ fontSize: 12.5 }}>automatic · 14 days</span></div>
        {up.length ? <div className="lv-tl">{up.map((x, i) => <div className={`lv-ti t-${upTone(x.e.kind)}`} key={i}><div className="d">{dow(x.d)} {fd(x.d)} · {upKind(x.e.kind)}</div>
          <div className="lv-ti-r"><div><b>{x.e.text}</b><small>{x.pname}</small></div><Go href={ownerHref(x.e.o)} className="btn sm go" ariaLabel={`View ${x.e.o.name}`}>View</Go></div></div>)}</div>
          : <Empty kind="cal" small title="Nothing scheduled">No bills or warnings in the next 14 days.</Empty>}</div>
    </div>

    <aside className="lv-side">
    {waCard ? <><Lbl>WhatsApp limit</Lbl>{waCard}</> : null}
    <Lbl>What happened</Lbl>
    <div className="card lv-act"><div className="card-row"><h3>Activity</h3><Go href="/log" className="btn sm">See all</Go></div>
        <LiveTabs tabs={[{ key: 'pay', label: 'Payments', badge: newN, body: payFeed }, { key: 'wa', label: 'WhatsApp', badge: waSent, seen: { name: waSeenName, value: waLatest }, body: waFeed },
          ...(true ? [{ key: 'staff', label: admin ? 'Staff' : 'Building managers', body: <ActivityList list={accActs} staff={staffList} projects={projs} empty={admin ? 'Nothing yet. What accountants and building managers do shows here.' : 'Nothing yet. What building managers do (cash, possessions, messages) shows here.'} /> }] : [])]} /></div>
    </aside>
    </div>
    {modal}
  </>;
}
