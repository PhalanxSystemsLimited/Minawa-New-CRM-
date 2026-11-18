// Cash (17 Nov 2026): every payment is cash, so this screen follows it from the person who took it to the bank.
//  · Building manager: the confirmed cash he holds per building, entries still waiting for the Accountant, and a
//    "Hand over" button; his hand-overs and what the Accountant said.
//  · Accountant: hand-overs to count and receive (or send back with a note), received cash to deposit in the bank
//    (one slip can cover several hand-overs), and the cash still with each building manager.
//  · Admin: everything, read-only.
//  · Everyone: the daily reconciliation for any day, with a CSV.
import { requireStaff, roleName } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { cashNow, dayCash } from '@/lib/cash';
import { handOverAction, receiveHandoverAction, returnHandoverAction, depositAction } from '@/lib/actions-cash';
import { Submit } from '@/components/client';
import { fd, fds, rs, todayPKT, t12, diff } from '@/lib/fmt';
import type { Handover } from '@/lib/types';
import { PageIc, KIc, Empty } from '@/components/views/art';

export const dynamic = 'force-dynamic';

const hStatus = (h: Handover) => h.status === 'pending' ? <span className="tag warn">With the Accountant to count</span>
  : h.status === 'disputed' ? <span className="tag bad">Sent back</span>
  : h.depositSlip ? <span className="tag good">In the bank · slip {h.depositSlip}</span> : <span className="tag info">Received · not deposited yet</span>;

export default async function Cash({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, me = await requireStaff(), today = todayPKT();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.d || '') && sp.d! <= today ? sp.d! : today;
  const projects = await liveProjects(me), states = await Promise.all(projects.map(p => load(p.id, me)));
  const now = cashNow(states), rec = dayCash(states, day);
  if (me.role === 'manager') { rec.rows = rec.rows.filter(r => r.collectorId === me.id); rec.pending = rec.pending.filter(x => x.pr.byId === me.id); }
  const mgr = me.role === 'manager', acc = me.role === 'accountant';
  const sum = (l: { amount: number }[]) => l.reduce((a, x) => a + x.amount, 0);
  const myHand = mgr ? now.withStaff.filter(w => w.collectorId === me.id) : now.withStaff;
  const myPending = mgr ? now.unconfirmed.filter(u => u.pr.byId === me.id) : now.unconfirmed;
  const myHist = (mgr ? now.history.filter(x => x.h.fromId === me.id) : now.history).slice(0, 40);
  const toReceive = mgr ? now.toReceive.filter(x => x.h.fromId === me.id) : now.toReceive;
  const deposited30 = now.history.filter(x => x.h.depositD && diff(today, x.h.depositD) <= 30);

  return <>
    <div className="proj-head"><PageIc n="wallet" tone="green" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Cash</div></div><div className="crumb-path">Dashboard<span>/</span>Cash</div></div>
    <p className="muted" style={{ margin: 0 }}>{mgr ? 'The cash you have taken until the Accountant approves it. Give the cash to the Accountant with your entries: when he approves them, it is with him.'
      : acc ? 'Approving building managers\' cash entries (To do) means you have the cash. Record the bank deposit here when it goes into the bank.'
      : 'Where the cash is: with the building managers, with the Accountant, or in the bank. You only watch here.'}</p>

    <div className={mgr ? 'kpis' : 'kpis flow'} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
      <div className="kpi"><KIc n="building" tone="rust" /><div className="l">{mgr ? 'Cash with you' : 'With building managers'}</div><div className="v num">{rs(sum(myHand) + sum(myPending.map(u => u.pr)))}</div><div className="cell-sub">entered, not approved yet</div></div>
      <div className="kpi"><KIc n="hourglass" tone="amber" /><div className="l">Waiting for approval</div><div className="v num">{rs(sum(myPending.map(u => u.pr)))}</div><div className="cell-sub">{myPending.length} entr{myPending.length === 1 ? 'y' : 'ies'}</div></div>
      <div className="kpi"><KIc n="swap" tone="violet" /><div className="l">Handed over, to count</div><div className="v num">{rs(sum(toReceive.map(x => x.h)))}</div><div className="cell-sub">{toReceive.length} hand-over{toReceive.length === 1 ? '' : 's'}</div></div>
      {mgr ? null : <div className="kpi"><KIc n="user" tone="teal" /><div className="l">With the Accountant</div><div className="v num">{rs(sum(now.toDeposit.map(x => x.h)))}</div><div className="cell-sub">received, not in the bank yet</div></div>}
      {mgr ? null : <div className="kpi"><KIc n="bank" tone="blue" /><div className="l">Deposited</div><div className="v num">{rs(sum(deposited30.map(x => x.h)))}</div><div className="cell-sub">last 30 days</div></div>}
    </div>

    {mgr ? <div className="card"><div className="card-row"><h3>Cash with you <small>until the Accountant approves it</small></h3></div>
      {projects.filter(p => (me.projects || []).includes(p.id)).map(p => {
        const w = myHand.find(x => x.project === p.id), pend = myPending.filter(u => u.pr.project === p.id);
        return <div className="li" key={p.id} style={{ alignItems: 'flex-start' }}><div className="t"><div className="a"><b>{p.name}</b> · <span className="num">{rs((w?.amount || 0) + sum(pend.map(u => u.pr)))}</span></div>
          {pend.length ? <div className="b">{pend.length} cash entr{pend.length === 1 ? 'y' : 'ies'} waiting for the Accountant: give him the cash and he approves them.</div> : null}
          {w ? <div className="b">{rs(w.amount)} approved earlier and not handed over yet ({w.n} payment{w.n === 1 ? '' : 's'} since {fds(w.oldest)}).</div> : null}
          {w ? <div className="b">{w.list.map(x => `${x.receipt} ${rs(x.amount)}`).join(' · ')}</div> : null}</div>
          {w ? <form action={handOverAction} className="ho-form" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><input type="hidden" name="pid" value={p.id} />
            <input name="note" type="text" placeholder="Note (optional)" aria-label={`Note for the hand-over at ${p.name}`} style={{ minWidth: 160 }} />
            <Submit className="btn primary sm">Hand over {rs(w.amount)}</Submit></form> : null}
        </div>;
      })}
    </div> : null}

    {acc && now.toReceive.length ? <div className="card" id="receive"><div className="card-row"><h3>Hand-overs to receive <small>count the cash, then confirm</small></h3></div>
      <div className="list">{now.toReceive.map(({ h, pname }) => <div className="li" key={h.id} style={{ alignItems: 'flex-start' }}><div className="t"><div className="a"><b>{h.fromName}</b> · {pname} · <span className="num">{rs(h.amount)}</span></div>
        <div className="b">{h.id} · {fd(h.d)} {t12(h.t)} · {h.paymentIds.length} payment{h.paymentIds.length === 1 ? '' : 's'}{h.note ? ` · ${h.note}` : ''}</div></div>
        <form action={receiveHandoverAction} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><input type="hidden" name="pid" value={h.project} /><input type="hidden" name="id" value={h.id} />
          <input name="reply" type="text" placeholder="Note (needed if something is wrong)" aria-label="Note" style={{ minWidth: 200 }} />
          <button type="submit" formAction={returnHandoverAction} formNoValidate className="btn sm">Problem: send back</button>
          <button type="submit" className="btn primary sm">Received {rs(h.amount)}</button></form>
      </div>)}</div></div> : null}

    {!mgr ? <div className="card" id="deposit"><div className="card-row"><h3>Received, not deposited yet <small>{rs(sum(now.toDeposit.map(x => x.h)))}</small></h3></div>
      {now.toDeposit.length ? (acc ? <form action={depositAction}>
        <div className="tbl-wrap"><table><thead><tr><th></th><th>Hand-over</th><th>Building</th><th>From</th><th>Received</th><th className="r">Amount</th></tr></thead><tbody>
          {now.toDeposit.map(({ h, pname }) => <tr key={h.id}><td><input type="checkbox" name="h" value={`${h.project}:${h.id}`} defaultChecked aria-label={`Deposit ${h.id}`} /></td><td>{h.id}</td><td>{pname}</td><td>{h.fromName}</td><td>{h.receivedD ? fds(h.receivedD) : ''}</td><td className="r num">{rs(h.amount)}</td></tr>)}
        </tbody></table></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 12 }}>
          <div className="form-row" style={{ margin: 0 }}><label htmlFor="dp-s">Deposit slip number</label><input id="dp-s" name="slip" type="text" required /></div>
          <div className="form-row" style={{ margin: 0 }}><label htmlFor="dp-d">Deposited on</label><input id="dp-d" name="d" type="date" defaultValue={today} max={today} required /></div>
          <Submit className="btn primary">Record bank deposit</Submit></div>
      </form> : <div className="tbl-wrap"><table><thead><tr><th>Hand-over</th><th>Building</th><th>From</th><th>Received by</th><th className="r">Amount</th></tr></thead><tbody>
          {now.toDeposit.map(({ h, pname }) => <tr key={h.id}><td>{h.id}</td><td>{pname}</td><td>{h.fromName}</td><td>{h.receivedBy} · {h.receivedD ? fds(h.receivedD) : ''}</td><td className="r num">{rs(h.amount)}</td></tr>)}
        </tbody></table></div>) : <Empty kind="cash" small title="All received cash is in the bank" />}
    </div> : null}

    {!mgr ? <div className="card"><div className="card-row"><h3>Cash still with building managers <small>confirmed, not handed over</small></h3></div>
      {now.withStaff.length ? <div className="tbl-wrap"><table><thead><tr><th>Building manager</th><th>Building</th><th>Payments</th><th>Oldest</th><th className="r">Amount</th></tr></thead><tbody>
        {now.withStaff.map(w => <tr key={w.project + w.collectorId}><td><b>{w.name}</b></td><td>{w.pname}</td><td>{w.n}</td><td>{fds(w.oldest)}{diff(today, w.oldest) > 2 ? <> <span className="tag warn">{diff(today, w.oldest)} days</span></> : null}</td><td className="r num">{rs(w.amount)}</td></tr>)}
      </tbody></table></div> : <Empty kind="done" small title="No cash is waiting with the building managers" />}
      {now.unconfirmed.length ? <p className="cell-sub" style={{ marginTop: 8 }}>Also {rs(sum(now.unconfirmed.map(u => u.pr)))} entered by building managers and not confirmed yet ({now.unconfirmed.length}): see To do.</p> : null}
    </div> : null}

    {mgr && myPending.length ? <div className="card"><div className="card-row"><h3>Entries waiting for the Accountant <small>{myPending.length}</small></h3></div>
      <div className="list">{myPending.map(({ pr, pname, apt }) => <div className="li" key={pr.id}><div className="t"><div className="a"><span className="apt-t">{apt}</span> · {pname} · <span className="num">{rs(pr.amount)}</span></div><div className="b">entered {fd(pr.d)}{pr.ref ? ` · receipt ${pr.ref}` : ''}</div></div>
        <a className="btn sm" href={`/p/${pr.project}/apartments/${pr.ownerId}?tab=payments`}>Open</a></div>)}</div></div> : null}

    <div className="card" id="day"><div className="card-row"><h3>Daily reconciliation <small>{fd(day)}</small></h3>
      <form method="get" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><input type="date" name="d" defaultValue={day} max={today} aria-label="Day" /><button type="submit" className="btn sm">Show</button>
        <a className="btn sm" href={`/api/export/cash?d=${day}`}>CSV</a></form></div>
      {rec.rows.length ? <div className="tbl-wrap"><table><thead><tr><th>Building</th><th>Who took the cash</th><th className="r">In hand at start</th><th className="r">Taken</th><th className="r">Handed over</th><th className="r">In hand at end</th></tr></thead><tbody>
        {rec.rows.map(r => <tr key={r.project + r.collectorId}><td>{r.pname}</td><td><b>{r.name}</b></td><td className="r num">{rs(r.open)}</td><td className="r num">{rs(r.collected)}{r.nCollected ? <div className="cell-sub">{r.nCollected} payment{r.nCollected === 1 ? '' : 's'}</div> : null}</td><td className="r num">{rs(r.handed)}</td><td className="r num"><b>{rs(r.close)}</b></td></tr>)}
        <tr><td colSpan={2}><b>Total</b></td><td className="r num">{rs(rec.rows.reduce((a, r) => a + r.open, 0))}</td><td className="r num">{rs(rec.rows.reduce((a, r) => a + r.collected, 0))}</td><td className="r num">{rs(rec.rows.reduce((a, r) => a + r.handed, 0))}</td><td className="r num"><b>{rs(rec.rows.reduce((a, r) => a + r.close, 0))}</b></td></tr>
      </tbody></table></div> : <Empty kind="cal" small title="No cash moved on this day" />}
      {!mgr ? <div className="grid2" style={{ marginTop: 12 }}>
        <div><b>Received by the Accountant</b> · {rs(sum(rec.received.map(x => x.h)))}{rec.received.length ? <ul className="cell-sub">{rec.received.map(({ h, pname }) => <li key={h.id}>{h.id} · {h.fromName} · {pname} · {rs(h.amount)}</li>)}</ul> : <div className="cell-sub">Nothing</div>}</div>
        <div><b>Deposited in the bank</b> · {rs(sum(rec.deposited.map(x => x.h)))}{rec.deposited.length ? <ul className="cell-sub">{rec.deposited.map(({ h, pname }) => <li key={h.id}>{h.id} · {pname} · slip {h.depositSlip} · {rs(h.amount)}</li>)}</ul> : <div className="cell-sub">Nothing</div>}</div>
      </div> : null}
      {rec.pending.length ? <p className="cell-sub" style={{ marginTop: 8 }}>Not counted above: {rs(sum(rec.pending.map(x => x.pr)))} in {rec.pending.length} entr{rec.pending.length === 1 ? 'y' : 'ies'} still waiting for the Accountant to confirm.</p> : null}
    </div>

    <div className="card"><div className="card-row"><h3>{mgr ? 'Your hand-overs' : 'Hand-overs'} <small>latest {myHist.length}</small></h3></div>
      {myHist.length ? <div className="tbl-wrap"><table><thead><tr><th>Hand-over</th><th>Date</th>{mgr ? null : <th>From</th>}<th>Building</th><th>Status</th><th className="r">Amount</th></tr></thead><tbody>
        {myHist.map(({ h, pname }) => <tr key={h.project + h.id}><td>{h.id}{h.note ? <div className="cell-sub">{h.note}</div> : null}</td><td style={{ whiteSpace: 'nowrap' }}>{fds(h.d)} {t12(h.t)}</td>{mgr ? null : <td>{h.fromName}</td>}<td>{pname}</td>
          <td>{hStatus(h)}{h.receivedBy ? <div className="cell-sub">{h.status === 'disputed' ? 'by' : 'received by'} {h.receivedBy}{h.receivedD ? ` · ${fds(h.receivedD)}` : ''}{h.reply ? ` · "${h.reply}"` : ''}</div> : null}{h.depositD ? <div className="cell-sub">deposited {fds(h.depositD)} by {h.depositedBy}</div> : null}</td>
          <td className="r num">{rs(h.amount)}</td></tr>)}
      </tbody></table></div> : <p className="empty">No hand-overs yet.</p>}
    </div>
  </>;
}
