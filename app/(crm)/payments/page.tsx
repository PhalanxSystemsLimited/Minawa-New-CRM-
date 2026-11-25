// Payments (21 Nov 2026): one screen for every role, in place of Cash and Received payments. All payments in the
// person's buildings, cash and bank transfer (filter: All / Cash / Bank transfer), in two lists:
//  · Not confirmed yet: building managers' entries the Accountant hasn't confirmed (they already count for the
//    customer, who has the receipt). Once the Accountant confirms one, it moves to the list below.
//  · Confirmed payments: for the month picked.
// With Cash (or All) on, the cash follow-up from the old Cash screen sits underneath: the Accountant's bank deposits,
// older hand-overs, and the daily reconciliation.
import { requireStaff, roleName } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { receivedRows, type RecRow } from '@/lib/received';
import { cashNow, dayCash } from '@/lib/cash';
import { handOverAction, receiveHandoverAction, returnHandoverAction, depositAction } from '@/lib/actions-cash';
import { Go, PrintBtn, Submit } from '@/components/client';
import { fd, fds, fm, rs, todayPKT, t12, prevMonth, diff, periodText } from '@/lib/fmt';
import type { Handover } from '@/lib/types';
import { PageIc, KIc, Empty } from '@/components/views/art';
import { Ic } from '@/components/icons';
import { PhotoLink } from '@/components/views/bits';

export const dynamic = 'force-dynamic';

const hStatus = (h: Handover) => h.status === 'pending' ? <span className="tag warn">With the Accountant to count</span>
  : h.status === 'disputed' ? <span className="tag bad">Sent back</span>
  : h.depositSlip ? <span className="tag good">In the bank · slip {h.depositSlip}</span> : <span className="tag info">Received · not deposited yet</span>;

export default async function Payments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, me = await requireStaff(), today = todayPKT();
  const mgr = me.role === 'manager', acc = me.role === 'accountant';
  const all = await liveProjects(me), pid = all.some(p => p.id === sp.p) ? sp.p! : '';
  const allTime = sp.month === 'all', month = allTime ? '' : /^\d{4}-\d{2}$/.test(sp.month || '') && sp.month! <= today.slice(0, 7) ? sp.month! : today.slice(0, 7);
  const via = sp.via === 'Cash' || sp.via === 'Bank transfer' ? sp.via : '';
  const mine = mgr && sp.mine === '1', who = mgr ? '' : sp.who || '';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.d || '') && sp.d! <= today ? sp.d! : today;
  const states = await Promise.all((pid ? all.filter(p => p.id === pid) : all).map(p => load(p.id, me)));
  const f = { via, who, mine: mine ? me.id : null };
  const waiting = receivedRows(states, { ...f, status: 'waiting' });                 // every month: nothing waits long
  const confirmed = receivedRows(states, { ...f, status: 'confirmed', month });
  const inMonth = receivedRows(states, { ...f, month });
  const sum = (l: { p: { amount: number } }[]) => l.reduce((a, r) => a + r.p.amount, 0);
  const cashOf = (l: RecRow[]) => l.filter(r => r.via === 'Cash');
  const people = mgr ? [] : [...new Set(receivedRows(states, { month }).flatMap(r => [r.enteredBy, r.approvedBy]).filter(Boolean))].sort();
  const params = { p: pid, month: allTime ? 'all' : month === today.slice(0, 7) ? '' : month, via, who, mine: mine ? '1' : '' };
  const href = (k: Record<string, string>) => { const q = new URLSearchParams(Object.entries({ ...params, ...k }).filter(([, v]) => v)).toString(); return '/payments' + (q ? '?' + q : ''); };
  const csv = new URLSearchParams(Object.entries({ project: pid, month: allTime ? 'all' : month, via, who, mine: mine ? '1' : '' }).filter(([, v]) => v)).toString();
  const months: [string, string][] = []; for (let m = today.slice(0, 7), i = 0; i < 12; m = prevMonth(m), i++) months.push([m === today.slice(0, 7) ? '' : m, fm(m)]);
  const period = allTime ? 'all time' : fm(month);

  // Cash follow-up (the old Cash screen), for the buildings shown.
  const showCash = via !== 'Bank transfer';
  const now = cashNow(states), rec = dayCash(states, day);
  if (mgr) { rec.rows = rec.rows.filter(r => r.collectorId === me.id); rec.pending = rec.pending.filter(x => x.pr.byId === me.id); }
  const myHand = mgr ? now.withStaff.filter(w => w.collectorId === me.id) : now.withStaff;
  const myHist = (mgr ? now.history.filter(x => x.h.fromId === me.id) : now.history).slice(0, 40);
  const hsum = (l: { h: { amount: number } }[]) => l.reduce((a, x) => a + x.h.amount, 0);

  const table = (rows: RecRow[], kind: 'waiting' | 'confirmed') => <div className="tbl-wrap"><table><thead><tr><th>Date</th><th>Apartment</th><th>Customer</th>{pid ? null : <th>Building</th>}<th className="r">Amount</th><th>Received as</th><th>Entered by</th><th>{kind === 'waiting' ? 'Waiting' : 'Confirmed by'}</th><th>Receipt</th></tr></thead><tbody>
    {rows.map(r => <tr key={r.p.project + r.p.id}><td style={{ whiteSpace: 'nowrap' }}>{fds(r.p.d)} <span className="cell-sub">{t12(r.p.t)}</span></td>
      <td><Go href={`/p/${r.p.project}/apartments/${r.p.ownerId}?tab=payments`}><b>{r.apt}</b></Go></td><td>{r.owner}</td>{pid ? null : <td>{r.pname}</td>}
      <td className="r num"><b>{rs(r.p.amount)}</b>{r.p.periodFrom ? <div className="cell-sub">for {periodText(r.p.periodFrom, r.p.periodTo)}</div> : null}</td>
      <td>{r.via === 'Cash' ? <span className="tag warn">Cash</span> : <span className="tag info">Bank transfer</span>}{r.p.forWhat === 'electricity' ? <> <span className="tag">Electricity</span></> : null}{r.p.txn ? <div className="cell-sub">{r.p.txn}</div> : null}{r.p.photoId ? <PhotoLink pid={r.p.project} id={r.p.photoId} /> : null}</td>
      <td>{r.enteredBy || '—'}{r.enteredById === me.id ? <div className="cell-sub">you</div> : null}</td>
      <td>{kind === 'waiting' ? <span className={`tag ${diff(today, r.p.d) > 2 ? 'bad' : 'warn'}`}>{diff(today, r.p.d) === 0 ? 'Since today' : `${diff(today, r.p.d)} day${diff(today, r.p.d) === 1 ? '' : 's'}`}</span>
        : <>{r.approvedBy || '—'}{r.p.approvedAt ? <div className="cell-sub">{fds(r.p.approvedAt.slice(0, 10))}</div> : null}</>}</td>
      <td><Go href={`/p/${r.p.project}/apartments/${r.p.ownerId}?doc=receipt:${r.p.id}`}>{r.p.receipt}</Go>{r.p.ref && r.p.ref !== r.p.txn ? <div className="cell-sub">{r.p.ref}</div> : null}</td></tr>)}
    <tr className="pay-tot"><td colSpan={pid ? 3 : 4}><b>{rows.length} payment{rows.length === 1 ? '' : 's'}</b></td><td className="r num"><b>{rs(sum(rows))}</b></td><td colSpan={4} className="cell-sub">cash {rs(sum(cashOf(rows)))} · bank {rs(sum(rows) - sum(cashOf(rows)))}</td></tr>
  </tbody></table></div>;

  return <>
    <div className="proj-head"><PageIc n="cash" tone="green" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Payments</div></div><div className="crumb-path">Dashboard<span>/</span>Payments</div></div>
    <p className="muted" style={{ margin: 0 }}>{mgr ? 'Every payment in your buildings, cash and bank transfer. Your entries count for the customer at once, with the receipt; they stay under "Not confirmed yet" until the Accountant confirms the money (give him the cash: his confirmation is the hand-over).'
      : acc ? 'Every payment in your buildings, cash and bank transfer. Building managers\' entries already count for the customer; they wait under "Not confirmed yet" until you confirm the money (in To do), then move to Confirmed payments.'
      : 'Every payment, cash and bank transfer: what the Accountant has confirmed, and what is still waiting for him.'}</p>

    <div className="card no-print pay-filters">
      <div className="pay-chips">
        <span className="cell-sub">Received as</span>
        <Go href={href({ via: '' })} className="chipbtn" pressed={!via} replace>All</Go>
        <Go href={href({ via: 'Cash' })} className="chipbtn" pressed={via === 'Cash'} replace><Ic n="cash" s={14} /> Cash</Go>
        <Go href={href({ via: 'Bank transfer' })} className="chipbtn" pressed={via === 'Bank transfer'} replace><Ic n="bank" s={14} /> Bank transfer</Go>
      </div>
      {mgr ? <div className="pay-chips"><span className="cell-sub">Entered by</span><Go href={href({ mine: '' })} className="chipbtn" pressed={!mine} replace>Anyone</Go><Go href={href({ mine: '1' })} className="chipbtn" pressed={mine} replace>Me</Go></div> : null}
      <form method="get" className="pay-form">
        {via ? <input type="hidden" name="via" value={via} /> : null}{mine ? <input type="hidden" name="mine" value="1" /> : null}
        {all.length > 1 ? <div className="form-row" style={{ margin: 0 }}><label htmlFor="py-p">Building</label><select id="py-p" name="p" defaultValue={pid}><option value="">All your buildings</option>{all.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div> : null}
        <div className="form-row" style={{ margin: 0 }}><label htmlFor="py-m">Confirmed in</label><select id="py-m" name="month" defaultValue={allTime ? 'all' : month === today.slice(0, 7) ? '' : month}>{months.map(([v, l]) => <option key={v || 'now'} value={v}>{l}</option>)}<option value="all">All time</option></select></div>
        {mgr ? null : <div className="form-row" style={{ margin: 0 }}><label htmlFor="py-w">Entered or confirmed by</label><select id="py-w" name="who" defaultValue={who}><option value="">Anyone</option>{people.map(x => <option key={x}>{x}</option>)}</select></div>}
        <button type="submit" className="btn">Show</button><span style={{ flex: 1 }} />
        <a className="btn" href={`/api/export/received?${csv}`}><Ic n="download" s={15} /> Download Excel</a><PrintBtn><Ic n="print" s={15} /> Print</PrintBtn>
      </form>
    </div>

    <div className="rpt">
      <div className="print-only"><h2 style={{ margin: '0 0 4px' }}>Payments · {period}{via ? ` · ${via}` : ''}</h2><p className="muted" style={{ margin: '0 0 12px' }}>{pid ? all.find(p => p.id === pid)?.name : 'All buildings'}</p></div>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="kpi"><KIc n="cash" tone="green" /><div className="l">Received, {period}</div><div className="v num">{rs(sum(inMonth))}</div><div className="cell-sub">{inMonth.length} payment{inMonth.length === 1 ? '' : 's'}</div></div>
        {via !== 'Bank transfer' ? <div className="kpi"><KIc n="wallet" tone="amber" /><div className="l">Cash</div><div className="v num">{rs(sum(cashOf(inMonth)))}</div><div className="cell-sub">{cashOf(inMonth).length} payment{cashOf(inMonth).length === 1 ? '' : 's'}</div></div> : null}
        {via !== 'Cash' ? <div className="kpi"><KIc n="bank" tone="blue" /><div className="l">Bank transfer</div><div className="v num">{rs(sum(inMonth) - sum(cashOf(inMonth)))}</div><div className="cell-sub">{inMonth.length - cashOf(inMonth).length} payment{inMonth.length - cashOf(inMonth).length === 1 ? '' : 's'}</div></div> : null}
        <div className="kpi"><KIc n="hourglass" tone="red" /><div className="l">Not confirmed yet</div><div className="v num">{rs(sum(waiting))}</div><div className="cell-sub">{waiting.length} entr{waiting.length === 1 ? 'y' : 'ies'} waiting for the Accountant</div></div>
      </div>

      <div className="card" id="waiting"><div className="card-row"><h3 data-hic="hourglass" data-tone="amber">Not confirmed yet <small>{waiting.length ? `${rs(sum(waiting))} · ${waiting.length} entr${waiting.length === 1 ? 'y' : 'ies'}` : 'nothing waiting'}</small></h3>
        {acc && waiting.length ? <Go href="/tasks#entries" className="btn sm primary no-print"><Ic n="tick" s={15} /> Confirm in To do</Go> : null}</div>
        {waiting.length ? <>{table(waiting, 'waiting')}<p className="cell-sub" style={{ margin: '8px 0 0' }}>{acc ? 'They already count for the customers. Confirm each one in To do once the money is with you (cash in hand, or the transfer seen in the bank); it then moves to Confirmed payments.' : 'They already count for the customers, who have their receipts. The Accountant confirms each one once the money reaches him; it then moves to Confirmed payments.'}</p></>
          : <Empty kind="done" small title="Nothing waiting">Every payment entered so far is confirmed.</Empty>}
      </div>

      <div className="card" id="confirmed"><div className="card-row"><h3 data-hic="okc" data-tone="green">Confirmed payments <small>{period} · newest first</small></h3>
        {allTime ? null : <Go href={href({ month: prevMonth(month) })} className="btn sm no-print">← {fm(prevMonth(month))}</Go>}</div>
        {confirmed.length ? table(confirmed, 'confirmed') : <Empty kind="pay" small title={`No confirmed payments in ${period}${via || who || mine ? ' with these filters' : ''}`} />}
      </div>
    </div>

    {showCash ? <>
      {mgr && myHand.length ? <div className="card"><div className="card-row"><h3>Older cash to hand over <small>approved before 19 Nov 2026</small></h3></div>
        {myHand.map(w => <div className="li" key={w.project} style={{ alignItems: 'flex-start' }}><div className="t"><div className="a"><b>{w.pname}</b> · <span className="num">{rs(w.amount)}</span></div>
          <div className="b">{w.n} payment{w.n === 1 ? '' : 's'} since {fds(w.oldest)}: {w.list.map(x => `${x.receipt} ${rs(x.amount)}`).join(' · ')}</div></div>
          <form action={handOverAction} className="ho-form" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><input type="hidden" name="pid" value={w.project} />
            <input name="note" type="text" placeholder="Note (optional)" aria-label={`Note for the hand-over at ${w.pname}`} style={{ minWidth: 160 }} />
            <Submit className="btn primary sm">Hand over {rs(w.amount)}</Submit></form></div>)}
      </div> : null}

      {acc && now.toReceive.length ? <div className="card" id="receive"><div className="card-row"><h3>Hand-overs to receive <small>count the cash, then confirm</small></h3></div>
        <div className="list">{now.toReceive.map(({ h, pname }) => <div className="li" key={h.id} style={{ alignItems: 'flex-start' }}><div className="t"><div className="a"><b>{h.fromName}</b> · {pname} · <span className="num">{rs(h.amount)}</span></div>
          <div className="b">{h.id} · {fd(h.d)} {t12(h.t)} · {h.paymentIds.length} payment{h.paymentIds.length === 1 ? '' : 's'}{h.note ? ` · ${h.note}` : ''}</div></div>
          <form action={receiveHandoverAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><input type="hidden" name="pid" value={h.project} /><input type="hidden" name="id" value={h.id} />
            <input name="reply" type="text" placeholder="Note (needed if something is wrong)" aria-label="Note" style={{ minWidth: 200 }} />
            <button type="submit" formAction={returnHandoverAction} formNoValidate className="btn sm">Problem: send back</button>
            <button type="submit" className="btn primary sm">Received {rs(h.amount)}</button></form>
        </div>)}</div></div> : null}

      {!mgr ? <div className="card" id="deposit"><div className="card-row"><h3 data-hic="bank" data-tone="blue">Cash to deposit in the bank <small>{rs(hsum(now.toDeposit))} confirmed, not deposited yet</small></h3></div>
        {now.toDeposit.length ? (acc ? <form action={depositAction}>
          <div className="tbl-wrap" data-nocap><table><thead><tr><th></th><th>Batch</th><th>Building</th><th>From</th><th>Confirmed</th><th className="r">Amount</th></tr></thead><tbody>
            {now.toDeposit.map(({ h, pname }) => <tr key={h.id}><td><input type="checkbox" name="h" value={`${h.project}:${h.id}`} defaultChecked aria-label={`Deposit ${h.id}`} /></td><td>{h.id}</td><td>{pname}</td><td>{h.fromName}</td><td>{h.receivedD ? fds(h.receivedD) : ''}</td><td className="r num">{rs(h.amount)}</td></tr>)}
          </tbody></table></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
            <div className="form-row" style={{ margin: 0 }}><label htmlFor="dp-s">Deposit slip number</label><input id="dp-s" name="slip" type="text" required /></div>
            <div className="form-row" style={{ margin: 0 }}><label htmlFor="dp-d">Deposited on</label><input id="dp-d" name="d" type="date" defaultValue={today} max={today} required /></div>
            <Submit className="btn primary">Record bank deposit</Submit></div>
        </form> : <div className="tbl-wrap"><table><thead><tr><th>Batch</th><th>Building</th><th>From</th><th>Confirmed by</th><th className="r">Amount</th></tr></thead><tbody>
            {now.toDeposit.map(({ h, pname }) => <tr key={h.id}><td>{h.id}</td><td>{pname}</td><td>{h.fromName}</td><td>{h.receivedBy} · {h.receivedD ? fds(h.receivedD) : ''}</td><td className="r num">{rs(h.amount)}</td></tr>)}
          </tbody></table></div>) : <Empty kind="cash" small title="All confirmed cash is in the bank" />}
        <p className="cell-sub" style={{ margin: '8px 0 0' }}>Cash the Accountant has confirmed (and cash paid at the office), grouped per building manager. Tick what went into the bank and record the slip number.</p>
      </div> : null}

      {!mgr && now.withStaff.length ? <div className="card"><div className="card-row"><h3>Older cash still with building managers <small>approved before 19 Nov 2026, not handed over</small></h3></div>
        <div className="tbl-wrap"><table><thead><tr><th>Building manager</th><th>Building</th><th>Payments</th><th>Oldest</th><th className="r">Amount</th></tr></thead><tbody>
          {now.withStaff.map(w => <tr key={w.project + w.collectorId}><td><b>{w.name}</b></td><td>{w.pname}</td><td>{w.n}</td><td>{fds(w.oldest)}</td><td className="r num">{rs(w.amount)}</td></tr>)}
        </tbody></table></div></div> : null}

      <div className="card" id="day"><div className="card-row"><h3>Daily cash reconciliation <small>{fd(day)}</small></h3>
        <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{Object.entries(params).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}<input type="date" name="d" defaultValue={day} max={today} aria-label="Day" /><button type="submit" className="btn sm">Show</button>
          <a className="btn sm" href={`/api/export/cash?d=${day}`}><Ic n="download" s={15} /> Excel</a></form></div>
        {rec.rows.length ? <div className="tbl-wrap"><table><thead><tr><th>Building</th><th>Who took the cash</th><th className="r">In hand at start</th><th className="r">Taken</th><th className="r">Handed over</th><th className="r">In hand at end</th></tr></thead><tbody>
          {rec.rows.map(r => <tr key={r.project + r.collectorId}><td>{r.pname}</td><td><b>{r.name}</b></td><td className="r num">{rs(r.open)}</td><td className="r num">{rs(r.collected)}{r.nCollected ? <div className="cell-sub">{r.nCollected} payment{r.nCollected === 1 ? '' : 's'}</div> : null}</td><td className="r num">{rs(r.handed)}</td><td className="r num"><b>{rs(r.close)}</b></td></tr>)}
          <tr><td colSpan={2}><b>Total</b></td><td className="r num">{rs(rec.rows.reduce((a, r) => a + r.open, 0))}</td><td className="r num">{rs(rec.rows.reduce((a, r) => a + r.collected, 0))}</td><td className="r num">{rs(rec.rows.reduce((a, r) => a + r.handed, 0))}</td><td className="r num"><b>{rs(rec.rows.reduce((a, r) => a + r.close, 0))}</b></td></tr>
        </tbody></table></div> : <Empty kind="cal" small title="No cash moved on this day" />}
        {!mgr ? <div className="grid2" style={{ marginTop: 12 }}>
          <div><b>Confirmed by the Accountant</b> · {rs(hsum(rec.received))}{rec.received.length ? <ul className="cell-sub">{rec.received.map(({ h, pname }) => <li key={h.id}>{h.id} · {h.fromName} · {pname} · {rs(h.amount)}</li>)}</ul> : <div className="cell-sub">Nothing</div>}</div>
          <div><b>Deposited in the bank</b> · {rs(hsum(rec.deposited))}{rec.deposited.length ? <ul className="cell-sub">{rec.deposited.map(({ h, pname }) => <li key={h.id}>{h.id} · {pname} · slip {h.depositSlip} · {rs(h.amount)}</li>)}</ul> : <div className="cell-sub">Nothing</div>}</div>
        </div> : null}
        {rec.pending.length ? <p className="cell-sub" style={{ marginTop: 8 }}>Not counted above: {rs(rec.pending.reduce((a, x) => a + x.pr.amount, 0))} in {rec.pending.length} cash entr{rec.pending.length === 1 ? 'y' : 'ies'} still waiting for the Accountant.</p> : null}
      </div>

      {myHist.length ? <div className="card"><div className="card-row"><h3>{mgr ? 'Your cash batches' : 'Cash batches'} <small>latest {myHist.length}</small></h3></div>
        <div className="tbl-wrap"><table><thead><tr><th>Batch</th><th>Date</th>{mgr ? null : <th>From</th>}<th>Building</th><th>Status</th><th className="r">Amount</th></tr></thead><tbody>
          {myHist.map(({ h, pname }) => <tr key={h.project + h.id}><td>{h.id}{h.note ? <div className="cell-sub">{h.note}</div> : null}</td><td style={{ whiteSpace: 'nowrap' }}>{fds(h.d)} {t12(h.t)}</td>{mgr ? null : <td>{h.fromName}</td>}<td>{pname}</td>
            <td>{hStatus(h)}{h.receivedBy ? <div className="cell-sub">{h.status === 'disputed' ? 'by' : 'confirmed by'} {h.receivedBy}{h.receivedD ? ` · ${fds(h.receivedD)}` : ''}{h.reply ? ` · "${h.reply}"` : ''}</div> : null}{h.depositD ? <div className="cell-sub">deposited {fds(h.depositD)} by {h.depositedBy}</div> : null}</td>
            <td className="r num">{rs(h.amount)}</td></tr>)}
        </tbody></table></div></div> : null}
    </> : null}
  </>;
}
