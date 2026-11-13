// One apartment (the demo's viewOwner): the flat, its owner, and bills, payments, history, notes and messages.
import { cur, ownerById, accountsOf, currentOf, balance, ownerStatus, sortedPayments, unpaid, isAdmin, feePct, periodLabel, nextBillFor, sheetOf } from '@/lib/engine';
import { getStore } from '@/lib/store';
import type { WaLog } from '@/lib/types';
import { PLAN_LABEL } from '@/lib/types';
import { fd, fds, fm, ord, rs, diff } from '@/lib/fmt';
import { Go, A } from '@/components/client';
import { projectPage, projHead } from '@/components/views/project';
import { pill, when, viaHtml, waBtn, ownerSince } from '@/components/views/bits';
import { restoreAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function Apartment({ params, searchParams }: { params: Promise<{ pid: string; oid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid, oid } = await params, sp = await searchParams;
  let wa: WaLog[] = [];
  try { wa = await (await getStore()).getWaLog({ ownerId: oid, limit: 30 }); } catch { wa = []; }
  return projectPage(pid, { ...sp, oid }, () => {
    const S = cur(), sel = ownerById(oid), base = `/p/${pid}/apartments/${oid}`;
    if (!sel) return <>{projHead('owners')}<div className="card allclear"><div className="big">Apartment not found</div><Go href={`/p/${pid}/apartments`} className="btn">← Apartments</Go></div></>;
    const accts = accountsOf(sel), o = currentOf(sel), ids = new Set(accts.map(x => x.id)), many = accts.length > 1;
    const who = (id: string) => many ? <div className="cell-sub">{ownerById(id)?.name || ''}</div> : null;
    const bal = balance(o), st = ownerStatus(o), closed = o.status === 'closed';
    const bills = S.bills.filter(b => ids.has(b.ownerId)).sort((a, b) => a.billDate < b.billDate ? 1 : -1);
    let run = 0;
    const led = S.entries.filter(e => ids.has(e.ownerId)).map(e => { run += e.amount; return { e, run }; }).reverse();
    const msgs = S.messages.filter(m => ids.has(m.ownerId) && m.from === 'biz').slice(-10).reverse();
    const notes = accts.flatMap(x => x.notes.map(n => ({ owner: x.name, ...n }))).sort((a, b) => a.d < b.d ? 1 : -1);
    const susp = accts.flatMap(x => x.suspensions), activeSusp = o.suspensions.filter(s => !s.to);
    const earlier = accts.filter(x => x !== o);
    const tab = ['bills', 'payments', 'history', 'notes'].includes(sp.tab) ? sp.tab : 'bills';
    const pays = sortedPayments().filter(p => ids.has(p.ownerId));
    const m = (k: string) => `${base}?m=${k}`;
    const adminItem = (k: string, label: string) => isAdmin() ? <Go href={m(k)}>{label}</Go> : <button aria-disabled="true" title="Admins only">{label} · admins</button>;
    const msgTag = (x: typeof msgs[number]) => /^Test:/.test(x.error || '') && x.status !== 'failed' ? <span className="tag warn" title={x.error || ''}>Test only</span> : x.status === 'failed' ? <span className="tag bad" title={x.error || ''}>Failed</span> : x.status === 'skipped' ? <span className="tag" title={x.error || ''}>Not sent</span> : x.status === 'pending' ? <span className="tag warn" title="Waiting to be sent by hand from Send on WhatsApp">To send</span> : x.status === 'sent' && x.waId === 'hand' ? <span className="tag info">Sent by hand</span>: x.status === 'queued' ? <span className="tag warn">Sending</span>
      : x.status === 'read' ? <span className="tag good">Read</span> : x.manual && x.status === 'sent' ? <span className="tag info">Sent by staff</span> : x.status === 'delivered' || (x.status === 'sent' && diff(S.today, x.d) >= 1) ? <span className="tag">Delivered</span> : <span className="tag">Sent</span>;

    const billsTab = bills.length ? <>
      <div className="tbl-wrap"><table><thead><tr><th>Bill</th><th>Due</th><th className="r">Amount</th><th className="r">Unpaid</th><th>Status</th></tr></thead><tbody>
        {bills.map(b => { const bo = ownerById(b.ownerId), u = unpaid(b), s = u <= 0 ? 'paid' : bo.flagged && S.today >= b.finalDate ? 'flagged' : S.today > b.dueDate ? 'overdue' : 'due';
          return <tr key={b.id}><td><A href={`${base}?tab=bills&doc=bill:${b.id}`}>{periodLabel(b)}</A>{b.extras ? <div className="cell-sub">incl. {rs(b.extras)} {b.lines.filter(l => l.kind === 'utility').map(l => l.label.split(',')[0].toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</div> : null}{b.fromCredit ? <div className="cell-sub">paid from credit</div> : null}{who(b.ownerId)}</td><td>{fds(b.dueDate)}</td><td className="r num">{rs(b.net)}{b.discount ? <div className="cell-sub">after {rs(b.discount)} discount</div> : null}</td><td className="r num">{u > 0 ? rs(u) : '–'}</td><td>{pill(s)}</td></tr>; })}
      </tbody></table></div>
      {o.feeDue > 0 ? <div className="callout warn" style={{ marginTop: 12 }}><div>Fine <b className="num">{rs(o.feeDue)}</b>: {feePct()}% of {S.settings.rules.fineArrears ? 'everything owed' : 'the unpaid bills'} while a bill is overdue.</div></div> : null}
      <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>Tap a bill to see it. Bills go out on the {ord(S.settings.rules.billDay)}, due {S.settings.rules.dueDays} days later. The day after the due date a fine of {feePct()}% of {S.settings.rules.fineArrears ? 'all dues' : 'the unpaid bills'} is added.</p>
    </> : <p className="empty">No bills yet.</p>;
    const paysTab = pays.length ? <div className="tbl-wrap"><table><thead><tr><th>When</th><th className="r">Amount</th><th>Received</th><th className="r">Balance after</th><th>Receipt</th></tr></thead><tbody>
      {pays.map(p => <tr key={p.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{when(p.d, p.t)}{who(p.ownerId)}</td><td className="r num"><strong>{rs(p.amount)}</strong></td><td>{viaHtml(p)}</td><td className="r num">{p.balAfter < 0 ? <span className="neg">{rs(-p.balAfter)} cr</span> : rs(p.balAfter)}</td><td><A href={`${base}?tab=payments&doc=receipt:${p.id}`} className="rcpt">{p.receipt}</A></td></tr>)}
    </tbody></table></div> : <p className="empty">No payments yet.</p>;
    const historyTab = led.length ? <div className="tbl-wrap"><table><thead><tr><th>Date</th><th>What happened</th><th className="r">Amount</th><th className="r">Balance</th></tr></thead><tbody>
      {led.map(({ e, run }) => <tr key={e.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{fds(e.d)}</td><td><div>{e.desc}</div>{e.ref ? <div className="cell-sub num">{e.ref}</div> : null}{who(e.ownerId)}</td><td className={`r num ${e.amount < 0 ? 'neg' : ''}`}>{e.amount < 0 ? '−' + rs(-e.amount) : rs(e.amount)}</td><td className="r num">{run < 0 ? <span className="neg">{rs(-run)} cr</span> : rs(run)}</td></tr>)}
    </tbody></table></div> : <p className="empty">Nothing yet.</p>;
    const notesTab = <>
      {closed ? null : <div style={{ marginBottom: 12 }}><Go href={m('note')} className="btn sm">+ Add note</Go></div>}
      {notes.length ? <div className="notes">{notes.map((n, i) => <div className="note" key={i}><div>{n.text}</div><div className="by">{n.by} · {fd(n.d)}{many ? ` · owner then: ${n.owner}` : ''}</div></div>)}</div> : <p className="empty">No notes yet. Add what the owner said on a call.</p>}
      <h3 style={{ marginTop: 20 }}>Messages sent</h3>
      {msgs.length ? <div className="list">{msgs.map(x => <div className="li" key={x.id}><div className="t"><div className="a">{x.title}</div><div className="b">{fd(x.d)} · {x.t}{many ? ` · to ${ownerById(x.ownerId).name}` : ''}{x.error ? ` · ${x.error}` : ''}</div></div>{msgTag(x)}</div>)}</div> : <p className="empty">No messages yet.</p>}
      {susp.length ? <><h3 style={{ marginTop: 20 }}>Disconnections</h3><div className="list">{susp.map((s, i) => <div className="li" key={i}><div className="t"><div className="a">{s.service}</div><div className="b">Disconnected {fd(s.from)}{s.to ? ' · restored ' + fd(s.to) : ''}</div></div>{s.to ? <span className="tag good">Restored</span> : <span className="tag bad">Active</span>}</div>)}</div></> : null}
    </>;
    const tabBtn = (k: string, label: string) => <Go href={`${base}?tab=${k}`} current={tab === k ? 'true' : 'false'} replace>{label}</Go>;

    return <>
      {projHead('owners', `Apartment ${o.apt}`)}
      <Go href={`/p/${pid}/apartments`} className="back">← Apartments</Go>
      <div className="card">
        <div className="prof-head">
          <div>
            <h2>Apartment {o.apt}</h2>
            <div className="meta-row"><span>Block {o.block}{o.floor ? ` · ${o.floor}` : ''} · {o.type} · {S.proj.name}</span>{o.exempt ? <span>{o.exemptWhy ? 'Not billed' : 'Exempt'}</span> : closed ? <span>No current owner since {fd(o.closedOn!)}</span> : <span>{PLAN_LABEL[o.plan || 'monthly']} billing · next bill {fd(nextBillFor(o))}{o.possessionKnown === false ? ' (no possession date yet)' : ''}</span>}</div>
            <div className="tags">{pill(st)}{o.promiseUntil ? <span className="tag warn">Promised by {fds(o.promiseUntil)} · reminders paused</span> : null}{activeSusp.map((s, i) => <span key={i} className="tag bad">{s.service} cut {fds(s.from)}</span>)}{o.invalidPhone ? <span className="tag bad">{o.noPhone ? 'No WhatsApp number' : 'Not on WhatsApp'}</span> : null}{o.rate ? <span className="tag warn">Own rate {rs(o.rate)}</span> : null}{o.discount && o.discount.value ? <span className="tag good">{o.discount.kind === 'pct' ? o.discount.value + '%' : rs(o.discount.value)} discount</span> : null}{o.abroad ? <span className="tag info">Owner lives abroad</span> : null}</div>
            <div className="owner-box">
              <div className="ob-row"><span className="ob-l">{closed ? 'Last owner' : 'Owner'}</span><span className="ob-n">{o.name}{o.director ? <> <span className="tag">Director</span></> : null}</span></div>
              <div className="cell-sub">{o.phone ? o.phone : 'No WhatsApp number'} · {ownerSince(o)}</div>
              {earlier.length ? <div className="ob-prev"><span className="ob-l">Earlier owners</span>{earlier.map(x => { const c = S.clearances.find(k => k.ownerId === x.id);
                return <div className="cell-sub" key={x.id}>{x.name} · {x.possessionKnown === false ? '' : fd(x.possession) + ' – '}{x.closedOn ? fd(x.closedOn) : ''}{c ? ` · cleared, ${c.no}` : ''}</div>; })}</div> : null}
            </div>
          </div>
          <div className="bal"><div className="l">{bal < 0 ? 'Credit' : 'Owes'}</div><div className="v num" style={{ color: bal > 0 ? (st === 'flagged' ? 'var(--bad)' : 'var(--fg)') : 'var(--good)' }}>{rs(Math.abs(bal))}</div><div className="cell-sub">{bal < 0 ? 'Used for the next bills' : bal > 0 ? '' : 'All paid'}</div></div>
        </div>
        {closed ? null : <div className="actions">
          {bal > 0 ? <Go href={m('recpay')} className="btn primary">Record payment</Go> : null}
          {bal > 0 && !o.exempt ? waBtn(o) : null}
          <details className="more"><summary className="btn">More ▾</summary><div className="menu">
            {bal > 0 ? <Go href={m('promise')}>Promise to pay</Go> : <button disabled>Promise to pay</button>}
            <Go href={m('note')}>Add note</Go>
            <Go href={m('edit')}>Edit owner and WhatsApp number</Go>
            <Go href={m('adjust')}>Adjustment (charge or credit)</Go>
            {bal > 0 ? null : <Go href={m('recpay')}>Record payment</Go>}
            <Go href={`${base}?doc=statement:${o.id}`}>Statement of dues (PDF)</Go>
            {adminItem('discount', 'Discount')}
            <hr />
            <Go href={m('clearance')}>Dues clearance certificate</Go>
            {adminItem('transfer', 'Transfer to a new owner')}
            {o.flagged || (activeSusp.length && bal <= 0) ? <hr /> : null}
            {o.flagged ? <Go href={m('disconnect')} className="danger">Record disconnection</Go> : null}
            {activeSusp.length && bal <= 0 ? <form action={restoreAction}><input type="hidden" name="pid" value={pid} /><input type="hidden" name="oid" value={o.id} /><button type="submit">Record restoration</button></form> : null}
          </div></details>
        </div>}
      </div>
      {o.exempt ? <div className={`callout ${o.exemptWhy ? 'warn' : ''}`}>{o.exemptWhy ? o.exemptWhy : 'Directors\' apartments are exempt, so no bills are sent.'}</div> : null}
      {(() => { const x = sheetOf(o); if (!x) return null;
        return <div className="card"><div className="card-row"><h3>2026 <small>office sheet as on {fd(x.asOf)}</small></h3><span className="cell-sub">{x.source}</span></div>
          <div className="sheet-box">
            <div><div className="l">Arrears from before 2026</div><div className="v num">{rs(x.arrears)}</div></div>
            <div><div className="l">2026 charges</div><div className="v num">{rs(x.maintenance + x.electricity - x.discount + x.adjust)}</div><div className="cell-sub">Maintenance {rs(x.maintenance)}{x.electricity ? ` · electricity ${rs(x.electricity)}` : ''}{x.discount ? ` · discount −${rs(x.discount)}` : ''}{x.adjust ? ` · adjustment ${rs(x.adjust)}` : ''}</div></div>
            <div><div className="l">Paid</div><div className="v num">{rs(x.paid)}</div><div className="cell-sub">{rs(x.received)} on the sheet{x.since ? `, ${rs(x.since)} in the CRM since` : ''}</div></div>
            <div><div className="l">Balance on the sheet</div><div className="v num">{rs(x.balance)}</div><div className="cell-sub">Owed now: {rs(bal)}</div></div>
          </div></div>; })()}
      {wa.length ? <div className="card"><div className="card-row"><h3>WhatsApp sent by hand</h3><Go href="/whatsapp" className="btn sm">WhatsApp log</Go></div>
        <div className="tbl-wrap"><table><thead><tr><th>When</th><th>By</th><th>Message</th><th>Number</th><th>Answer</th></tr></thead><tbody>{wa.map(e =>
          <tr key={e.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{fd(e.d)}, {e.t}</td><td>{e.staffName}<div className="cell-sub">{e.staffRole === 'admin' ? 'Admin' : 'Accountant'}</div></td><td>{e.title}<div className="cell-sub">Balance then {rs(e.amount)}</div></td>
            <td className="num">+{e.sentTo}{e.test ? <div className="cell-sub">test number</div> : null}</td><td>{e.answer === 'sent' ? <span className="tag good">Sent</span> : <span className="tag warn">Not sent</span>}</td></tr>)}</tbody></table></div></div> : null}
      <div className="card">
        <div className="ptabs" role="tablist">
          {tabBtn('bills', 'Bills')}{tabBtn('payments', `Payments${pays.length ? ` (${pays.length})` : ''}`)}{tabBtn('history', 'History')}{tabBtn('notes', 'Notes & messages')}
        </div>
        {many ? <p className="cell-sub" style={{ margin: '-4px 0 10px' }}>Everything since the first owner; the owner at the time is shown under each line.</p> : null}
        {tab === 'bills' ? billsTab : tab === 'payments' ? paysTab : tab === 'history' ? historyTab : notesTab}
      </div>
    </>;
  });
}
