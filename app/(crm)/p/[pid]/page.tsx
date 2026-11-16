// A project's Overview (the demo's viewDash).
import { cur, balance, getTarget, collections, sortedPayments, ownerById, upcoming, followCount, nextEvent, ownerStatus, nextBillDate, apartments, isBillingDay, billsOf, unpaidMaint, firstBillDate, sheetStats } from '@/lib/engine';
import { addDays, hour12, ord, diff } from '@/lib/fmt';
import { MONL, dim, fds, fd, fm, fmShort, rs, dow, dowl, short } from '@/lib/fmt';
import { spInfo } from '@/lib/docdata';
import { pendingCount } from '@/lib/manual-send';
import { Ic } from '@/components/icons';
import { Go, A, GoRow } from '@/components/client';
import { projectPage, projHead, newPayments } from '@/components/views/project';
import { NeedTile, Kpi, Cycle, CalBadge, Lbl, Num } from '@/components/views/live';
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
    const todo = followCount(), ne = nextEvent(), sendN = pendingCount(), np0 = newPayments(), newN = np0.length, newAmt = np0.reduce((a, p) => a + p.amount, 0);
    const badge = (p: typeof recent[number]) => spInfo(p) ? <span className="sp-ok"><Ic n="check" s={12} /> Safepay</span> : <span className="recv-by"><Ic n="bank" s={12} /> {p.source === 'proof' ? 'Transfer' : 'Bank'}</span>;
    return <>
      {projHead('dashboard')}
      <Lbl>Needs you in {S.proj.name}</Lbl>
      <div className="lv-needs">
        <NeedTile icon="alert" tone="red" n={todo} label={todo === 1 ? 'thing to do' : 'things to do'} href={`${P}/todo`} pulse sub={todo ? 'Open To do' : 'All clear'} />
        <NeedTile icon="phone" tone="green" n={sendN} label="WhatsApp to send" href={`${P}/send`} sub={sendN ? 'Bills, reminders and receipts' : 'Nothing waiting'} />
        <NeedTile icon="wallet" tone="blue" n={newN} label={newN === 1 ? 'new payment' : 'new payments'} href={`${P}/payments`} sub={newN ? `${rs(newAmt)} since you last looked` : 'No new payments'} />
        <NeedTile icon="alert" tone="amber" n={flagged} label="flagged for disconnection" href={`${P}/apartments?f=flagged`} sub={flagged ? 'Still unpaid after the due date' : 'Nobody flagged'} />
      </div>
      <div className="lv-layout"><div className="lv-main">
      <section className="lv-money lv-ov">
        {firstBill ? <div className="lv-target"><div className="l">BILLING STARTS</div>
          <div className="lv-next-r big"><CalBadge date={firstBill} /><div><b className="H">{Math.max(0, diff(firstBill, S.today))} days to go</b><small>The first bill goes out on {fd(firstBill)} at {hour12(S.settings.rules.sendHour)}, for {fm(S.goLive.slice(0, 7))}</small></div></div>
          <div className="lv-sub"><span>Until then, payments go to old arrears: <b>{rs(arrears)}</b></span></div></div>
          : <div className="lv-target"><div className="l">{monName.toUpperCase()} TARGET <Go href={`${P}?m=target`} className="htg-link">Breakdown</Go></div>
          <div className="v H"><Num v={coll}>{rs(coll)}</Num> <small>of {rs(tg.total)}</small></div>
          <div className="lv-pace" role="img" aria-label={`${tgPct}% of the target collected`}><span style={{ width: `${Math.min(100, tgPct)}%` }}></span><i style={{ left: `${pace}%` }}><em>where you should be today</em></i></div>
          <div className="lv-sub"><span><b>{tgPct}%</b> collected</span><span>{tgLeft ? <>{rs(tgLeft)} to go · {daysLeft} day{daysLeft === 1 ? '' : 's'} left · <b>{rs(Math.ceil(tgLeft / Math.max(1, daysLeft)))} a day</b></> : 'Target met'}</span></div></div>}
        <div className="lv-kpis two">
          <Kpi label="Still to collect" value={<Num v={outstanding}>{rs(outstanding)}</Num>} sub={arrears && arrears >= outstanding ? 'all old arrears' : arrears ? `${rs(arrears)} old arrears` : `from ${owe.length} apartments`} href={`${P}/apartments?f=owing`} />
          <Kpi label="Apartments owing" value={<><Num v={owe.length}>{owe.length}</Num><small> of {act.length}</small></>} sub={`${flagged} flagged`} href={`${P}/apartments?f=owing`} />
          <Kpi label="Fines in it" value={<Num v={fees}>{rs(fees)}</Num>} sub={`${S.settings.rules.feePct}% after the due date`} href={`${P}/apartments?f=fine`} />
          {(() => { const y = sheetStats().sheet; return y ? <Kpi hl label="2026 paid" value={<><Num v={y.pct}>{y.pct}</Num>%</>} sub={`office sheet ${fd(y.asOf!)}`} />
            : <Kpi hl label={`Collected in ${monName}`} value={<Num v={coll}>{rs(coll)}</Num>} sub={`${payN} payment${payN === 1 ? '' : 's'}`} href={`${P}/payments?per=month`} />; })()}
        </div>
      </section>
      {(() => {
        // The billing cycle: what the next run will do, and the jobs that are the accountant's.
        const r = S.settings.rules, soonest = nextBillDate(addDays(S.today, S.settings.lastRun === S.today ? 1 : 0)), next = firstBill && firstBill > soonest ? firstBill : soonest, np = next.slice(0, 7);
        const flats = apartments().filter(o => o.status === 'active' && o.possession <= next);
        const toBill = flats.filter(o => isBillingDay(o, next)).length;
        const ut = r.utilities[0], utDone = ut ? flats.filter(o => S.charges.some(c => c.ownerId === o.id && c.period === np && c.kind === ut && c.amount)).length : 0;
        const rem = S.owners.filter(o => o.status === 'active').flatMap(o => billsOf(o)).filter(b => unpaidMaint(b) > 0 && b.dueDate > S.today && b.reminders.length < r.remindOn.length).length;
        const due = addDays(next, r.dueDays), flag = addDays(due, r.flagDays);
        const remDate = (d: number) => { const nm = d > r.billDay ? np : addDays(next, 28).slice(0, 7); return `${nm}-${String(d).padStart(2, '0')}`; };
        const steps = [
          { k: String(+next.slice(8)), title: 'Bills go out', sub: `${fds(next)} · ${hour12(r.sendHour)}`, tag: `${toBill} flat${toBill === 1 ? '' : 's'}`, tone: 'blue' as const },
          ...r.remindOn.map((d, i) => ({ k: String(d), title: `${ord(i + 2)} reminder`, sub: fds(remDate(d)), tag: i === 0 && rem ? `${rem} to come` : 'if unpaid', tone: 'amber' as const })),
          { k: String(+due.slice(8)), title: 'Due date', sub: fds(due), tag: `fine ${r.feePct}% next day`, tone: 'red' as const },
          { k: '⚑', title: 'Flag', sub: fds(flag), tag: 'if still unpaid', tone: 'grey' as const }];
        return <div className="card lv-cyclecard"><div className="card-row"><h3>Billing cycle <small>{fm(np)} bills go out on {fd(next)} at {hour12(r.sendHour)}</small></h3><Go href={`${P}/settings#fine`} className="btn sm">Fine {r.feePct}%</Go></div>
          <Cycle steps={steps} at={0} />
          <div className="desk-acts">
            {ut ? <Go href={`${P}/utilities?period=${np}`} className="btn sm primary">Enter {ut.toLowerCase()} bills <span className="lv-mini">{utDone} of {flats.length}</span></Go> : null}
            <Go href={`${P}/send?mode=notice`} className="btn sm">Send a notice</Go>
            <Go href={`${P}/apartments?m=possession`} className="btn sm">New possession</Go>
            <Go href={`${P}/apartments?f=owing`} className="btn sm">Record a payment</Go>
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
          {top.length ? <div className="list">{top.map(o => <GoRow as="div" key={o.id} href={ownerHref(o)} className="li click"><div className="t"><div className="a apt-t">{o.apt}</div><div className="b">{o.name}{o.promiseUntil ? ` · promised by ${fds(o.promiseUntil)}` : ''}</div></div><div className="amt"><strong className="num">{rs(balance(o))}</strong>{pill(ownerStatus(o))}{waMini(o)}</div></GoRow>)}</div> : <p className="empty">Nobody owes anything.</p>}</div>
        <div className="card lv-upc"><div className="card-row"><h3>Coming up</h3><span className="muted" style={{ fontSize: 12.5 }}>automatic</span></div>
          {up.length ? <div className="lv-tl">{up.map((x, i) => { const k = x.e.kind, tone = k === 'flag' || k === 'fine' ? 'red' : k === 'remind' ? 'amber' : k === 'bill' ? 'blue' : 'green';
            return <div className={`lv-ti t-${tone}`} key={i}><div className="d">{dow(x.d)} {fd(x.d)} · {k === 'bill' ? 'Bill' : k === 'remind' ? 'Reminder' : k === 'fine' ? 'Fine + notice' : k === 'flag' ? 'Flag' : 'Alert'}</div>
              <div className="lv-ti-r"><div><b>{x.e.text}</b></div><Go href={ownerHref(x.e.o)} className="btn sm go" ariaLabel={`View apartment ${x.e.o.apt}`}>View</Go></div></div>; })}</div> : <p className="empty">Nothing scheduled in the next 14 days.</p>}</div>
      </aside></div>
    </>;
  });
}
