// A project's Overview (the demo's viewDash).
import { cur, balance, getTarget, collections, sortedPayments, ownerById, upcoming, followCount, nextEvent, ownerStatus, nextBillOf, apartments, isBillingDay, billsOf, unpaidMaint, firstBillDate, sheetStats, openingDue, hasGenerator } from '@/lib/engine';
import { addDays, hour12, ord, diff } from '@/lib/fmt';
import { MONL, dim, fds, fd, fm, fmShort, rs, dow, dowl, short, nextMonth, dayIn } from '@/lib/fmt';
import { famOf } from '@/lib/queries';
import { pendingCount } from '@/lib/manual-send';
import { Ic } from '@/components/icons';
import { Go, A, GoRow } from '@/components/client';
import { projectPage, projHead, newPayments } from '@/components/views/project';
import { NeedTile, Kpi, Cycle, CalBadge, Lbl, Num, KIcon, Stack, MiniRing, Bars } from '@/components/views/live';
import { pill, waMini, when, ownerHref } from '@/components/views/bits';

export const dynamic = 'force-dynamic';

export default async function Overview({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), P = `/p/${pid}`;
    const act = S.owners.filter(o => o.status === 'active' && !o.exempt);
    const owe = act.filter(o => balance(o) > 0), outstanding = owe.reduce((s, o) => s + balance(o), 0);
    const fees = act.reduce((s, o) => s + (o.feeDue || 0), 0), flagged = act.filter(o => o.flagged).length;
    const mon = S.today.slice(0, 7), monName = MONL[+mon.slice(5) - 1], dom = +S.today.slice(8);
    const coll = S.payments.filter(p => p.d.slice(0, 7) === mon).reduce((s, p) => s + p.amount, 0);
    const payN = S.payments.filter(p => p.d.slice(0, 7) === mon).length;
    const tg = getTarget(mon), tgPct = tg.total ? Math.round(100 * coll / tg.total) : 0, tgLeft = Math.max(0, tg.total - coll);
    const dimN = dim(+mon.slice(0, 4), +mon.slice(5, 7)), daysLeft = dimN - dom + 1;
    const pace = Math.round(100 * (dom - 1) / dimN);
    const arrears = act.reduce((s, o) => s + (o.openingLeft || 0), 0);
    const fb = firstBillDate(), firstBill = S.today <= fb && (S.settings.lastRun || '') < fb ? fb : null;
    const co = collections(), coT = co.map(([p]) => getTarget(p).total), coMax = Math.max(1, ...co.map(x => x[1]), ...coT);
    const bw = Math.min(56, Math.floor(300 / Math.max(1, co.length)) - 14);
    const recent = sortedPayments().slice(0, 5);
    const top = [...owe].sort((a, b) => (+b.flagged - +a.flagged) || balance(b) - balance(a)).slice(0, 5);
    const up = upcoming(14, 5);
    const mgr = S.role === 'manager', toCheck = S.proofs.filter(p => p.status === 'pending').length;
    const todo = followCount(), ne = nextEvent(), sendN = pendingCount(), np0 = newPayments(), newN = np0.length, newAmt = np0.reduce((a, p) => a + p.amount, 0);
    const badge = (p: typeof recent[number]) => <span className="recv-by"><Ic n="bank" s={12} /> {famOf(p.method)}</span>;
    return <>
      {projHead('dashboard')}
      <Lbl>Needs you in {S.proj.name}</Lbl>
      <div className="lv-needs">
        <NeedTile title="To do" icon="alert" tone="red" n={todo} label={todo === 1 ? 'thing to do' : 'things to do'} href={mgr ? `${P}/todo` : '/tasks'} pulse sub={todo ? (mgr ? 'Open To do' : 'Building manager\'s work') : 'All clear'} />
        {mgr ? <NeedTile title="WhatsApp" icon="phone" tone="green" n={sendN} label="WhatsApp to send" href={`${P}/send`} sub={sendN ? 'Bills, reminders and receipts' : 'Nothing waiting'} />
          : <NeedTile title="To check" icon="wallet" tone="green" n={toCheck} label={toCheck === 1 ? 'payment to confirm' : 'payments to confirm'} href="/tasks" sub={toCheck ? 'Entered by the building manager' : 'Nothing waiting'} />}
        <NeedTile title="Payments" icon="wallet" tone="blue" n={newN} label={newN === 1 ? 'new payment' : 'new payments'} href={`${P}/payments`} sub={newN ? `${rs(newAmt)} since you last looked` : 'No new payments'} />
        <NeedTile title="Disconnection" icon="alert" tone="amber" n={flagged} label="flagged for disconnection" href={`${P}/apartments?f=flagged`} sub={flagged ? 'Still unpaid after the due date' : 'Nobody flagged'} />
      </div>
      <div className="lv-layout"><div className="lv-main">
      <section className="lv-money lv-ov">
        {firstBill ? <div className="lv-target"><div className="l">BILLING STARTS</div>
          <div className="lv-next-r big"><CalBadge date={firstBill} /><div><b className="H">{Math.max(0, diff(firstBill, S.today))} days to go</b><small>{S.settings.rules.startOn ? <>On {fd(firstBill)} at {hour12(S.settings.rules.sendHour)} every customer with a balance gets a statement, due {fd(openingDue())}. Monthly charges start in {fm(S.goLive.slice(0, 7))}.</> : <>The first bill goes out on {fd(firstBill)} at {hour12(S.settings.rules.sendHour)}, for {fm(S.goLive.slice(0, 7))}</>}</small></div></div>
          {(() => { const r = S.settings.rules, open = act.reduce((a, o) => a + (o.opening || 0), 0), rec = Math.max(0, open - arrears), rp = open ? Math.round(100 * rec / open) : 0, onBill = S.settings.rules.startOn ? act.filter(o => balance(o) > 0).length : act.filter(o => o.possession <= firstBill).length;
            return <>
              <div className="lv-mini-cycle lv-pre-cyc"><span><b>{fds(firstBill)}</b>{r.startOn ? 'Statement' : 'Bill'}</span>{r.remindOn.map(d => <span key={d}><b>{ord(d)}</b>Reminder</span>)}<span><b>{fds(openingDue())}</b>Due</span><span><b>{r.feePct}%</b>Fine after</span></div>
              <div className="lv-pre">
                {open ? <div><span className="lv-pre-h"><KIcon icon="bank" tone="teal" /><span className="k">Old arrears recovered</span></span><b className="H"><Num v={rec}>{rs(rec)}</Num> <small>of {rs(open)}</small></b><div className="lv-bar g"><span style={{ width: `${Math.min(100, rp)}%` }}></span></div><small>{rp}% recovered so far</small></div>
                  : <div><span className="lv-pre-h"><KIcon icon="bank" tone="teal" /><span className="k">Old arrears</span></span><b className="H">None</b><small>No earlier dues were brought in</small></div>}
                <div><span className="lv-pre-h"><KIcon icon="users" tone="violet" /><span className="k">{r.startOn ? 'Get a statement' : 'On the first bill'}</span></span><b className="H"><Num v={onBill}>{onBill}</Num> <small>flat{onBill === 1 ? '' : 's'} of {act.length}</small></b><div className="lv-bar a"><span style={{ width: `${act.length ? Math.round(100 * onBill / act.length) : 0}%` }}></span></div><small>{act.length - onBill ? (r.startOn ? `${act.length - onBill} owe nothing` : `${act.length - onBill} get possession later`) : 'Every apartment is included'}</small></div>
              </div></>; })()}
          <div className="lv-sub"><span>Until then, payments go to old arrears: <b>{rs(arrears)}</b></span></div></div>
          : <div className="lv-target"><div className="l">{monName.toUpperCase()} TARGET <Go href={`${P}?m=target`} className="htg-link">Breakdown</Go></div>
          <div className="v H"><Num v={coll}>{rs(coll)}</Num> <small>of {rs(tg.total)}</small></div>
          <div className="lv-pace" role="img" aria-label={`${tgPct}% of the target collected`}><span style={{ width: `${Math.min(100, tgPct)}%` }}></span><i style={{ left: `${pace}%` }}><em>where you should be today</em></i></div>
          <div className="lv-sub"><span><b>{tgPct}%</b> collected</span><span>{tgLeft ? <>{rs(tgLeft)} to go · {daysLeft} day{daysLeft === 1 ? '' : 's'} left · <b>{rs(Math.ceil(tgLeft / Math.max(1, daysLeft)))} a day</b></> : 'Target met'}</span></div>
          {(() => { const paidUp = act.length - owe.length, pu = act.length ? Math.round(100 * paidUp / act.length) : 0, perDay = Math.round(coll / Math.max(1, dom));
            return <div className="lv-pre lv-pre-ov">
              <div><span className="lv-pre-h"><KIcon icon="check" tone="teal" /><span className="k">Apartments paid up</span></span><b className="H"><Num v={paidUp}>{paidUp}</Num> <small>of {act.length}</small></b><div className="lv-bar g"><span style={{ width: `${pu}%` }}></span></div><small>{pu}% owe nothing</small></div>
              <div><span className="lv-pre-h"><KIcon icon="pulse" tone="violet" /><span className="k">Coming in a day</span></span><b className="H"><Num v={perDay}>{rs(perDay)}</Num></b><small>average so far this month · {payN} payment{payN === 1 ? '' : 's'}</small></div>
            </div>; })()}</div>}
        <div className="lv-kpis two">
          {(() => {
            // Money in over the last six months (all payments, old arrears included), for the small column chart.
            const ms: string[] = []; for (let i = 5; i >= 0; i--) { const d = new Date(+mon.slice(0, 4), +mon.slice(5, 7) - 1 - i, 1); ms.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
            const mv = ms.map(m => S.payments.filter(p => p.d.slice(0, 7) === m).reduce((a, p) => a + p.amount, 0)), ml = ms.map(m => MONL[+m.slice(5) - 1].slice(0, 3));
            const fineN = act.filter(o => (o.feeDue || 0) > 0).length, billsOwed = Math.max(0, outstanding - arrears - fees);
            const y = sheetStats().sheet;
            return <>
              <Kpi icon="wallet" tone="amber" label="Still to collect" value={<Num v={outstanding}>{rs(outstanding)}</Num>} sub={arrears && arrears >= outstanding ? 'all old arrears' : arrears ? `${rs(arrears)} old arrears` : `from ${owe.length} apartments`} href={`${P}/apartments?f=owing`}>
                <Stack parts={[{ v: arrears, label: 'Old arrears', tone: 'amber' }, { v: billsOwed, label: 'Bills', tone: 'rust' }, { v: fees, label: 'Fines', tone: 'red' }]} /></Kpi>
              <Kpi icon="building" tone="blue" label="Apartments owing" value={<><Num v={owe.length}>{owe.length}</Num><small> of {act.length}</small></>} sub={`${flagged} flagged · ${act.length - owe.length} paid up`} href={`${P}/apartments?f=owing`}
                chart={<MiniRing pct={act.length ? 100 * owe.length / act.length : 0} tone="blue" />} />
              <Kpi icon="percent" tone="red" label="Fines in it" value={<Num v={fees}>{rs(fees)}</Num>} sub={`${S.settings.rules.feePct}% after the due date`} href={`${P}/apartments?f=fine`}>
                <div className="lv-kmeta"><span>{fineN} flat{fineN === 1 ? '' : 's'} with a fine</span><span>{owe.length ? Math.round(100 * fineN / owe.length) : 0}% of those owing</span></div>
                <div className="lv-bar r"><span style={{ width: `${owe.length ? Math.round(100 * fineN / owe.length) : 0}%` }}></span></div></Kpi>
              {y ? <Kpi hl icon="trend" tone="green" label="2026 paid" value={<><Num v={y.pct}>{y.pct}</Num>%</>} sub={`office sheet ${fd(y.asOf!)} · money in, last 6 months`}><Bars values={mv} labels={ml} tone="green" /></Kpi>
                : <Kpi hl icon="trend" tone="green" label={`Collected in ${monName}`} value={<Num v={coll}>{rs(coll)}</Num>} sub={`${payN} payment${payN === 1 ? '' : 's'} · last 6 months`} href={`${P}/payments?per=month`}><Bars values={mv} labels={ml} tone="green" /></Kpi>}
            </>;
          })()}
        </div>
      </section>
      {(() => {
        // The billing cycle: what the next run will do, and the jobs that are the accountant's.
        const r = S.settings.rules, soonest = nextBillOf(S.owners, addDays(S.today, S.settings.lastRun === S.today ? 1 : 0)), next = firstBill && firstBill < soonest ? firstBill : soonest, np = next.slice(0, 7);
        const flats = apartments().filter(o => o.status === 'active' && o.possession <= next);
        const stmt = !!firstBill && next === firstBill && !!r.startOn;
        const toBill = stmt ? flats.filter(o => !o.exempt && balance(o) > 0).length : flats.filter(o => isBillingDay(o, next)).length;
        const ut = r.utilities[0], utDone = ut ? flats.filter(o => S.charges.some(c => c.ownerId === o.id && c.period === np && c.kind === ut && c.amount)).length : 0;
        const rem = S.owners.filter(o => o.status === 'active').flatMap(o => billsOf(o)).filter(b => unpaidMaint(b) > 0 && b.dueDate > S.today && b.reminders.length < r.remindOn.length).length;
        const due = stmt ? openingDue() : dayIn(nextMonth(np), r.dueDays), flag = addDays(due, r.flagDays);
        const remDate = (d: number) => dayIn(due.slice(0, 7), d);
        const steps = [
          { k: String(+next.slice(8)), title: stmt ? 'Statements go out' : 'Bills go out', sub: `${fds(next)} · ${hour12(r.sendHour)}`, tag: `${toBill} flat${toBill === 1 ? '' : 's'}`, tone: 'blue' as const },
          ...r.remindOn.map((d, i) => ({ k: String(d), title: `${ord(i + 2)} reminder`, sub: fds(remDate(d)), tag: i === 0 && rem ? `${rem} to come` : 'if unpaid', tone: 'amber' as const })),
          { k: String(+due.slice(8)), title: 'Due date', sub: fds(due), tag: `fine ${r.feePct}% next day`, tone: 'red' as const },
          { k: '⚑', title: 'Flag', sub: fds(flag), tag: 'if still unpaid', tone: 'grey' as const }];
        return <div className="card lv-cyclecard"><div className="card-row"><h3>Billing cycle <small>{stmt ? `Go-live statements on ${fd(next)}` : `Next bills on ${fd(next)}`} at {hour12(r.sendHour)} · each customer on their own billing date</small></h3><Go href={`${P}/settings#fine`} className="btn sm">Fine {r.feePct}%</Go></div>
          <Cycle steps={steps} at={0} />
          <div className="desk-acts">
            {ut && mgr ? <Go href={`${P}/utilities?period=${np}`} className="btn sm primary">Enter {ut.toLowerCase()} bills <span className="lv-mini">{utDone} of {flats.length}</span></Go> : null}
            {mgr ? <Go href={`${P}/send?mode=notice`} className="btn sm">Send a notice</Go> : null}
            {mgr && hasGenerator() ? <Go href={`${P}/generator`} className="btn sm">Generator charges list</Go> : null}
            <Go href={`${P}/apartments?m=possession`} className="btn sm">New possession</Go>
            {S.role !== 'admin' ? <Go href={`${P}/apartments?f=owing`} className="btn sm">{mgr ? 'Enter a payment' : 'Record a payment'}</Go> : null}
          </div></div>;
      })()}
      <div className="ov2">
        <div className="card chart"><div className="card-row"><h3>Collected each month</h3><Go href={`${P}/payments?per=all`} className="btn sm">View payments</Go></div>
          <svg viewBox="0 0 360 166" role="img" aria-label="Collections per month against each month's target"><line x1="20" x2="350" y1="140" y2="140" stroke="var(--line-strong)"></line>
            {co.map(([p, v], i) => {
              const step = 320 / co.length, x = 28 + i * step + (step - bw) / 2, h = Math.round(110 * v / coMax), y = 140 - h, isCur = p === mon;
              const ty = 140 - Math.round(110 * coT[i] / coMax);
              return <g key={p}><rect x={x} y={y} width={bw} height={Math.max(h, v ? 2 : 0)} fill={isCur ? 'var(--neon)' : 'var(--ink)'}><title>{`${fm(p)}: ${rs(v)} collected of ${rs(coT[i])} target`}</title></rect>
                {coT[i] ? <line x1={x - 5} x2={x + bw + 5} y1={ty} y2={ty} stroke="var(--neon-deep)" strokeWidth="2.5" strokeDasharray="5 3"></line> : null}
                <text className="v" x={x + bw / 2} y={Math.min(y, ty) - 6} textAnchor="middle">{v ? short(v) : '0'}</text><text x={x + bw / 2} y="158" textAnchor="middle">{fmShort(p).replace('-', ' ')}</text></g>;
            })}</svg>
          <div className="legend"><span><i className="lg-bar"></i>Collected</span><span><i className="lg-tgt"></i>Monthly target</span></div></div>
        <div className="card"><div className="card-row"><h3>Latest payments</h3><Go href={`${P}/payments?per=all`} className="btn sm">View all</Go></div>
          {recent.length ? <div className="list">{recent.map(p => { const o = ownerById(p.ownerId); return <div className="li" key={p.id}><div className="t"><A href={ownerHref(o)} className="apt-a">{o.apt}</A><div className="b">{o.name} · {when(p.d, p.t)}</div></div><div className="amt"><strong className="num">{rs(p.amount)}</strong>{badge(p)}<A href={`${P}?doc=receipt:${p.id}`} className="rcpt">{p.receipt}</A></div></div>; })}</div> : <p className="empty">No payments yet.</p>}</div>
      </div>
      </div>
      <aside className="lv-side">
        <div className="card lv-owes"><div className="card-row"><h3>Who owes</h3><Go href={`${P}/apartments?f=owing`} className="btn sm">View all</Go></div>
          {top.length ? <div className="list">{top.map(o => <GoRow as="div" key={o.id} href={ownerHref(o)} className="li click"><div className="t"><div className="a apt-t">{o.apt}</div><div className="b">{o.name}{o.promiseUntil ? ` · promised by ${fds(o.promiseUntil)}` : ''}</div></div><div className="amt"><strong className="num">{rs(balance(o))}</strong>{pill(ownerStatus(o))}{mgr ? waMini(o) : null}</div></GoRow>)}</div> : <p className="empty">Nobody owes anything.</p>}</div>
        <div className="card lv-upc"><div className="card-row"><h3>Coming up</h3><span className="muted" style={{ fontSize: 12.5 }}>automatic</span></div>
          {up.length ? <div className="lv-tl">{up.map((x, i) => { const k = x.e.kind, tone = k === 'flag' || k === 'fine' ? 'red' : k === 'remind' ? 'amber' : k === 'bill' ? 'blue' : 'green';
            return <div className={`lv-ti t-${tone}`} key={i}><div className="d">{dow(x.d)} {fd(x.d)} · {k === 'bill' ? 'Bill' : k === 'remind' ? 'Reminder' : k === 'fine' ? 'Fine + notice' : k === 'flag' ? 'Flag' : 'Alert'}</div>
              <div className="lv-ti-r"><div><b>{x.e.text}</b></div><Go href={ownerHref(x.e.o)} className="btn sm go" ariaLabel={`View apartment ${x.e.o.apt}`}>View</Go></div></div>; })}</div> : <p className="empty">Nothing scheduled in the next 14 days.</p>}</div>
      </aside></div>
    </>;
  });
}
