// A project's Overview (the demo's viewDash).
import { cur, balance, getTarget, collections, sortedPayments, ownerById, upcoming, followCount, nextEvent, ownerStatus, nextBillDate, apartments, isBillingDay, billsOf, unpaidMaint, billDateOf, sheetStats } from '@/lib/engine';
import { addDays, nextMonth, prevMonth, hour12 } from '@/lib/fmt';
import { MONL, dim, fds, fd, fm, fmShort, rs, dow, dowl, short } from '@/lib/fmt';
import { spInfo } from '@/lib/docdata';
import { pendingCount } from '@/lib/manual-send';
import { Ic } from '@/components/icons';
import { Go, A, GoRow } from '@/components/client';
import { projectPage, projHead } from '@/components/views/project';
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
    const tg = getTarget(mon), tgPct = tg.total ? Math.round(100 * coll / tg.total) : 0, tgLeft = Math.max(0, tg.total - coll);
    const dimN = dim(+mon.slice(0, 4), +mon.slice(5, 7)), daysLeft = dimN - dom + 1, perDay = Math.ceil(tgLeft / Math.max(1, daysLeft));
    const pace = Math.round(100 * (dom - 1) / dimN);
    const arrears = act.reduce((s, o) => s + (o.openingLeft || 0), 0), arrearsOwing = act.filter(o => o.openingLeft > 0).length;
    const firstBill = S.goLive.slice(0, 7) > mon ? billDateOf(prevMonth(S.goLive.slice(0, 7))) : null;
    const co = collections(), coT = co.map(([p]) => getTarget(p).total), coMax = Math.max(1, ...co.map(x => x[1]), ...coT);
    const bw = Math.min(56, Math.floor(300 / Math.max(1, co.length)) - 14);
    const recent = sortedPayments().slice(0, 5);
    const top = [...owe].sort((a, b) => (+b.flagged - +a.flagged) || balance(b) - balance(a)).slice(0, 5);
    const up = upcoming(14, 5);
    const todo = followCount(), ne = nextEvent();
    const stat = (label: string, value: string | number, href: string, cls?: string) => <Go href={href} className="hs hs-btn"><div className="l">{label}</div><div className={`v num ${cls || ''}`}>{value}</div></Go>;
    const badge = (p: typeof recent[number]) => spInfo(p) ? <span className="sp-ok"><Ic n="check" s={12} /> Safepay</span> : <span className="recv-by"><Ic n="bank" s={12} /> {p.source === 'proof' ? 'Transfer' : 'Bank'}</span>;
    return <>
      {projHead('dashboard')}
      <section className="hero hero-ov"><div>
        <div className="hero-chips"><span className="hchip"><span className="live"></span>Auto-billing on · sending by hand</span>{pendingCount() ? <Go href={`/p/${S.project}/send`} className="hchip">{pendingCount()} to send on WhatsApp</Go> : null}{ne ? <span className="hchip">Next: {fds(ne.d)} · {ne.ev[0].text}</span> : null}</div>
        <h2>Collections · <span>{monName}</span></h2>
        <p>{rs(outstanding)} is still to collect from {owe.length} apartment{owe.length === 1 ? '' : 's'}{fees ? `, including ${rs(fees)} in fines` : ''}{arrears ? ` (${rs(arrears)} of it is old arrears from before ${fm(S.goLive.slice(0, 7))})` : ''}. {todo ? `${todo} thing${todo > 1 ? 's' : ''} need${todo > 1 ? '' : 's'} you today.` : 'Nothing needs you today.'}</p>
        {firstBill && !tg.total ? <div className="htg">
          <div className="htg-top"><span className="l">Billing starts</span><b className="num">{fd(firstBill)}</b></div>
          <div className="htg-sub">The first bill goes out automatically on {fd(firstBill)} at {hour12(S.settings.rules.sendHour)}, for {fm(S.goLive.slice(0, 7))}. Until then, payments go to old arrears ({rs(arrears)} from {arrearsOwing} flat{arrearsOwing === 1 ? '' : 's'}).</div>
        </div> : <div className="htg">
          <div className="htg-top"><span className="l">{monName} target</span><b className="num">{rs(tg.total)}</b><Go href={`${P}?m=target`} className="htg-link">Breakdown</Go></div>
          <div className="htg-bar" role="img" aria-label={`${tgPct}% of the target collected`}><span style={{ width: `${Math.min(100, tgPct)}%` }}></span><i style={{ left: `${pace}%` }} title="Where collections would be if paid evenly through the month"></i></div>
          <div className="htg-sub">{rs(coll)} collected, {tgPct}%{tgLeft ? ` · ${rs(tgLeft)} to go · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left · ${rs(perDay)} a day` : ' · target met'}</div>
        </div>}
        <div className="hero-stats">
          {stat(`Collected in ${monName}`, rs(coll), `${P}/payments?per=month`, 'neon')}
          {stat('Outstanding', rs(outstanding), `${P}/apartments?f=owing`)}
          {stat('Apartments owing', owe.length, `${P}/apartments?f=owing`)}
          {stat('Flagged', flagged, `${P}/apartments?f=flagged`)}
        </div>
        {(() => { const y = sheetStats().sheet; return y ? <p className="hero-y26">2026, office sheet as on {fd(y.asOf!)}: <b>{rs(y.paid)}</b> paid of <b>{rs(y.due)}</b> owed for the year with arrears ({y.pct}%){y.since ? `, ${rs(y.since)} of it recorded in the CRM since` : ''}.</p> : null; })()}
        </div>
        <div className="hero-side">
          <div className="hero-btns"><a className="btn ghost-d" href={`/api/export/payments?project=${pid}&per=all`}><Ic n="download" s={16} /> Export</a>{todo ? <Go href={`${P}/todo`} className="btn neon"><Ic n="check" s={16} /> {todo} to do</Go> : null}</div>
          <div className="hero-date">{dowl(S.today)}, {fd(S.today)}</div>
        </div>
      </section>
      {(() => {
        // The accountant's desk: what the next billing run will do, and the jobs that are theirs.
        const r = S.settings.rules, soonest = nextBillDate(addDays(S.today, S.settings.lastRun === S.today ? 1 : 0)), next = firstBill && firstBill > soonest ? firstBill : soonest, np = next.slice(0, 7);
        const flats = apartments().filter(o => o.status === 'active' && o.possession <= next);
        const toBill = flats.filter(o => isBillingDay(o, next)).length;
        const ut = r.utilities[0], utDone = ut ? flats.filter(o => S.charges.some(c => c.ownerId === o.id && c.period === np && c.kind === ut && c.amount)).length : 0;
        const rem = S.owners.filter(o => o.status === 'active').flatMap(o => billsOf(o)).filter(b => unpaidMaint(b) > 0 && r.remindDays.some(d => addDays(b.dueDate, -d) > S.today)).length;
        const fineDay = S.bills.filter(b => unpaidMaint(b) > 0 && addDays(b.dueDate, 1) > S.today).map(b => addDays(b.dueDate, 1)).sort()[0];
        return <div className="card"><div className="card-row"><h3>Billing desk <small>{fm(nextMonth(np))} bills go out on {fd(next)} at {hour12(r.sendHour)}</small></h3><Go href={`${P}/settings#fine`} className="btn sm">Fine {r.feePct}%</Go></div>
          <div className="desk">
            <div><div className="l">Next bills</div><div className="v num">{toBill}</div><div className="cell-sub">flats on {fds(next)}, due {fds(addDays(next, r.dueDays))}</div></div>
            {ut ? <div><div className="l">{ut} entered</div><div className="v num">{utDone} <span className="muted" style={{ fontSize: 14 }}>of {flats.length}</span></div><div className="cell-sub">for {fm(np)}</div></div> : <div><div className="l">Utility bills</div><div className="v num">–</div><div className="cell-sub">not used here</div></div>}
            <div><div className="l">Reminders to come</div><div className="v num">{rem}</div><div className="cell-sub">{r.remindDays.length ? `${r.remindDays.join(' and ')} days before due` : 'off'}</div></div>
            <div><div className="l">Next fine day</div><div className="v num">{fineDay ? fds(fineDay) : '–'}</div><div className="cell-sub">fine {r.feePct}% on what&apos;s unpaid</div></div>
          </div>
          <div className="desk-acts">
            {ut ? <Go href={`${P}/utilities?period=${np}`} className="btn sm primary">Enter {ut.toLowerCase()} bills</Go> : null}
            <Go href={`${P}/notices`} className="btn sm">Send a notice</Go>
            <Go href={`${P}/apartments?m=possession`} className="btn sm">New possession</Go>
            <Go href={`${P}/apartments?f=owing`} className="btn sm">Record a payment</Go>
          </div></div>;
      })()}
      <div className="ov2">
        <div className="card"><div className="card-row"><h3>Who owes</h3><Go href={`${P}/apartments?f=owing`} className="btn sm">View all</Go></div>
          {top.length ? <div className="list">{top.map(o => <GoRow as="div" key={o.id} href={ownerHref(o)} className="li click"><div className="t"><div className="a apt-t">{o.apt}</div><div className="b">{o.name}{o.promiseUntil ? ` · promised by ${fds(o.promiseUntil)}` : ''}</div></div><div className="amt"><strong className="num">{rs(balance(o))}</strong>{pill(ownerStatus(o))}{waMini(o)}</div></GoRow>)}</div> : <p className="empty">Nobody owes anything.</p>}</div>
        <div className="card"><div className="card-row"><h3>Latest payments</h3><Go href={`${P}/payments?per=all`} className="btn sm">View all</Go></div>
          {recent.length ? <div className="list">{recent.map(p => { const o = ownerById(p.ownerId); return <div className="li" key={p.id}><div className="t"><A href={ownerHref(o)} className="apt-a">{o.apt}</A><div className="b">{o.name} · {when(p.d, p.t)}</div></div><div className="amt"><strong className="num">{rs(p.amount)}</strong>{badge(p)}<A href={`${P}?doc=receipt:${p.id}`} className="rcpt">{p.receipt}</A></div></div>; })}</div> : <p className="empty">No payments yet.</p>}</div>
      </div>
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
        <div className="card"><div className="card-row"><h3>Coming up</h3><span className="muted" style={{ fontSize: 12.5 }}>automatic</span></div>
          {up.length ? <div className="list">{up.map((x, i) => <div className="li" key={i}><div className="t"><div className="a">{x.e.text}</div><div className="b">{dow(x.d)} {fd(x.d)} · <span className={`tag ${x.e.kind === 'bill' || x.e.kind === 'remind' ? 'info' : x.e.kind === 'fine' || x.e.kind === 'flag' ? 'bad' : 'warn'}`}>{x.e.kind === 'bill' ? 'Bill' : x.e.kind === 'remind' ? 'Reminder' : x.e.kind === 'fine' ? 'Fine + notice' : x.e.kind === 'flag' ? 'Flag' : 'Alert'}</span></div></div><Go href={ownerHref(x.e.o)} className="btn sm go" ariaLabel={`View apartment ${x.e.o.apt}`}>View</Go></div>)}</div> : <p className="empty">Nothing scheduled in the next 14 days.</p>}</div>
      </div>
    </>;
  });
}
