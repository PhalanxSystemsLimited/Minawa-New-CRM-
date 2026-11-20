// One customer (21 Nov 2026): their details (customer ID, CNIC, address, phone), the flat and the dates (possession,
// and for a past customer the day they left), what they were charged and paid, their payments, their bills and
// every entry on their account from possession on, and the notes. Only this customer's account (a flat's earlier or
// later customers have their own pages).
import { cur, ownerById, accountsOf, balance, ownerStatus, sortedPayments, billsOf, unpaid, periodLabel, nextBillFor } from '@/lib/engine';
import { custId, cnicState, cnicNote } from '@/lib/people';
import { PLAN_LABEL } from '@/lib/types';
import { fd, fds, rs, t12 } from '@/lib/fmt';
import { Go, A } from '@/components/client';
import { projectPage } from '@/components/views/project';
import { pill, viaHtml, rcpt, ownerHref } from '@/components/views/bits';
import { PageIc, KIc } from '@/components/views/art';
import { Ic } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function Customer({ params, searchParams }: { params: Promise<{ pid: string; oid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid, oid } = await params, sp = await searchParams;
  return projectPage(pid, { ...sp, oid }, () => {
    const S = cur(), o = ownerById(oid), base = `/customers/${pid}/${oid}`;
    if (!o) return <><div className="proj-head"><PageIc n="users" tone="violet" /><div><div className="eyebrow-b">Customers</div><div className="proj-title">Customer not found</div></div></div>
      <div className="card allclear"><div className="big">This customer isn&apos;t in {S.proj.name}</div><Go href="/customers" className="btn">← Customers</Go></div></>;
    const past = o.status === 'closed', id = custId(o), bal = balance(o), st = ownerStatus(o), cs = cnicState(o.cnicExpiry, S.today);
    const pays = sortedPayments().filter(p => p.ownerId === o.id), good = pays.filter(p => !p.reversed);
    const bills = billsOf(o).slice().reverse();
    let run = 0; const led = S.entries.filter(e => e.ownerId === o.id).map(e => { run += e.amount; return { e, run }; }).reverse();
    const charged = S.entries.filter(e => e.ownerId === o.id && e.amount > 0).reduce((a, e) => a + e.amount, 0), paid = good.reduce((a, p) => a + p.amount, 0);
    const others = accountsOf(o).filter(x => x.id !== o.id), before = others.filter(x => (x.possession || '') <= (o.possession || '') && x.status === 'closed'), after = others.filter(x => !before.includes(x));
    const clr = S.clearances.find(c => c.ownerId === o.id);
    const kv = (rows: [string, React.ReactNode][]) => <div className="kv cus-kv">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v ?? '—'}</b></div>)}</div>;
    const link = (x: typeof o) => <Go key={x.id} href={`/customers/${pid}/${x.id}`} className="link-btn">{custId(x)} {x.name}</Go>;
    return <>
      <div className="proj-head"><PageIc n="users" tone="violet" /><div><div className="eyebrow-b">{past ? 'Past customer' : 'Customer'} · {id}</div><div className="proj-title">{o.name}</div></div>
        <div className="crumb-path"><A href="/">Dashboard</A><span>/</span><A href={past ? '/customers?v=past' : '/customers'}>Customers</A><span>/</span>{id}</div></div>
      {past ? <div className="callout warn cus-left"><div><b>Left on {o.closedOn ? fd(o.closedOn) : 'a date not on file'}.</b> Customer of {o.apt}, {S.proj.name} {o.possessionKnown ? `from ${fd(o.possession)} ` : ''}until then.{clr ? ` Dues clearance ${clr.no} issued on ${fd(clr.d)}.` : ''}{after.length ? <> Customer after them: {after.map(link)}.</> : ' The flat is empty now.'}</div></div> : null}
      <div className="cus-acts no-print">
        <Go href={ownerHref(o)} className="btn"><Ic n="building" s={15} /> Open flat {o.apt}</Go>
        {past ? null : <Go href={`${base}?m=edit`} className="btn"><Ic n="edit" s={15} /> Edit details</Go>}
        <a className="btn" href={`/api/pdf/${pid}/history/${encodeURIComponent(o.id)}`} target="_blank" rel="noopener"><Ic n="file" s={15} /> Payment history (PDF)</a>
        <a className="btn" href={`/api/pdf/${pid}/statement/${encodeURIComponent(o.id)}`} target="_blank" rel="noopener"><Ic n="receipt" s={15} /> Statement (PDF)</a>
      </div>
      <div className="kpis">
        <div className="kpi"><KIc n="receipt" tone="amber" /><div className="l">Charged</div><div className="v num">{rs(charged)}</div><div className="cell-sub">{bills.length} bill{bills.length === 1 ? '' : 's'}{o.opening ? ` · incl. ${rs(o.opening)} from before the CRM` : ''}</div></div>
        <div className="kpi"><KIc n="cash" tone="green" /><div className="l">Paid</div><div className="v num">{rs(paid)}</div><div className="cell-sub">{good.length} payment{good.length === 1 ? '' : 's'}</div></div>
        <div className="kpi"><KIc n="wallet" tone={bal > 0 ? 'red' : 'blue'} /><div className="l">{past ? 'Balance at leaving' : 'Balance now'}</div><div className="v num">{bal < 0 ? rs(-bal) : rs(bal)}</div><div className="cell-sub">{bal < 0 ? 'advance (credit)' : bal > 0 ? 'still owed' : 'nothing owed'}</div></div>
        <div className="kpi"><KIc n="key" tone="violet" /><div className="l">{past ? 'Customer for' : 'Customer since'}</div><div className="v num" style={{ fontSize: 22 }}>{o.possessionKnown ? fds(o.possession) : '—'}</div><div className="cell-sub">{past ? `left ${o.closedOn ? fd(o.closedOn) : '—'}` : o.possessionKnown ? 'possession date' : 'possession date not on file'}</div></div>
      </div>
      <div className="grid2">
        <div className="card"><h3 data-hic="user" data-tone="violet">Customer details <small>from the CNIC</small></h3>
          {kv([['Customer ID', <span className="num" key="i">{id}</span>], ['Full name', o.name],
            ['CNIC number', o.cnic ? <span className="num" key="c">{o.cnic}</span> : <span className="tag warn" key="c">Not on file</span>],
            ['CNIC expiry', o.cnicExpiry ? <span key="x">{fd(o.cnicExpiry)} {cs === 'expired' ? <span className="tag bad">{cnicNote(o.cnicExpiry, S.today)}</span> : cs === 'soon' ? <span className="tag warn">{cnicNote(o.cnicExpiry, S.today)}</span> : null}</span> : '—'],
            ['Address on CNIC', o.cnicAddress || '—'], ['WhatsApp', o.noPhone || !o.phone ? 'none' : <span className="num" key="p">{o.phone}</span>], ['Email', o.email || '—'], ['Lives abroad', o.abroad ? 'Yes' : 'No']])}
          {!past && (!o.cnic || cs !== 'ok') ? <p className="cell-sub" style={{ margin: '10px 0 0' }}>{!o.cnic ? 'Add the CNIC details with Edit details.' : cs === 'expired' ? 'Ask the customer for the renewed CNIC and update it with Edit details.' : cs === 'soon' ? 'The CNIC expires soon: ask for the renewed one when it is due.' : ''}</p> : null}
        </div>
        <div className="card"><h3 data-hic="building" data-tone="blue">Flat and dates</h3>
          {kv([['Flat', <Go key="f" href={ownerHref(o)} className="link-btn">{o.apt}</Go>], ['Building', S.proj.name], ['Block · floor', [o.block && `Block ${o.block}`, o.floor].filter(Boolean).join(' · ') || '—'], ['Type', o.type],
            ['Possession', o.possessionKnown ? fd(o.possession) : 'not on file'], ...(past ? [['Left on', o.closedOn ? fd(o.closedOn) : '—'] as [string, React.ReactNode]] : []),
            ['Billing plan', PLAN_LABEL[o.plan || 'monthly']], ['Status', pill(st)],
            ...(!past && !o.exempt ? [['Next bill', fd(nextBillFor(o))] as [string, React.ReactNode]] : []),
            ...(o.meterIn ? [['Meter at possession', `${o.meterIn.reading}`] as [string, React.ReactNode]] : []), ...(o.meterOut ? [['Meter at leaving', `${o.meterOut.reading}`] as [string, React.ReactNode]] : []),
            ...(before.length ? [['Before them', <span key="b">{before.map(link)}</span>] as [string, React.ReactNode]] : [])])}
        </div>
      </div>

      <div className="card" id="payments"><div className="card-row"><h3 data-hic="cash" data-tone="green">Payment history <small>{good.length} payment{good.length === 1 ? '' : 's'} · {rs(paid)}</small></h3></div>
        {pays.length ? <div className="tbl-wrap"><table className="apay-tbl"><thead><tr><th>When</th><th className="r">Amount</th><th>Received</th><th>For</th><th className="r">Balance after</th><th>Receipt</th></tr></thead><tbody>
          {pays.map(p => <tr key={p.id} className={p.reversed ? 'muted' : undefined}><td className="num" style={{ whiteSpace: 'nowrap' }}>{fds(p.d)} <span className="cell-sub">{t12(p.t)}</span></td>
            <td className="r num"><strong>{rs(p.amount)}</strong>{p.reversed ? <div><span className="tag bad">Taken back</span></div> : null}</td><td>{viaHtml(p)}{p.txn ? <div className="cell-sub num">{p.txn}</div> : null}</td>
            <td className="cell-sub">{p.forWhat === 'electricity' ? 'Electricity' : p.applied.length ? p.applied.map(a => a.label || a.ref).slice(0, 3).join(', ') : 'Advance'}</td>
            <td className="r num">{p.balAfter < 0 ? <span className="cell-sub">{rs(-p.balAfter)} advance</span> : rs(p.balAfter)}</td><td>{rcpt(p, base)}{p.ref ? <div className="cell-sub">{p.ref}</div> : null}</td></tr>)}
        </tbody></table></div> : <p className="empty">No payments yet.</p>}
      </div>

      <div className="card" id="charges"><div className="card-row"><h3 data-hic="receipt" data-tone="amber">Charges history <small>bills, newest first</small></h3></div>
        {bills.length ? <div className="tbl-wrap"><table className="bill-tbl"><thead><tr><th>Bill</th><th>Billed</th><th>Due</th><th>Charges</th><th className="r">Amount</th><th className="r">Paid</th><th className="r">Unpaid</th></tr></thead><tbody>
          {bills.map(b => { const u = unpaid(b); return <tr key={b.id}><td><A href={`${base}?doc=bill:${b.id}`}>{periodLabel(b)}</A><div className="cell-sub">{b.id}</div></td><td style={{ whiteSpace: 'nowrap' }}>{fds(b.billDate)}</td><td style={{ whiteSpace: 'nowrap' }}>{fds(b.dueDate)}</td>
            <td className="cell-sub">{b.lines.length ? b.lines.map((l, i) => <div key={i}>{l.label}: {rs(l.amount)}</div>) : `Maintenance ${rs(b.amount)}`}{b.discount ? <div>Discount −{rs(b.discount)}</div> : null}{b.fine ? <div>Fine {rs(b.fine)}</div> : null}</td>
            <td className="r num">{rs(b.net)}</td><td className="r num">{rs(b.paid + b.finePaid)}</td><td className="r num">{u > 0 ? <b>{rs(u)}</b> : <span className="tag good">Paid</span>}</td></tr>; })}
        </tbody></table></div> : <p className="empty">No bills yet{past ? '' : `: the first bill is on ${fd(nextBillFor(o))}`}.</p>}
      </div>

      <div className="card" id="history"><div className="card-row"><h3 data-hic="history" data-tone="blue">Account history <small>every charge, payment and correction since possession</small></h3></div>
        {led.length ? <div className="tbl-wrap"><table className="hist-tbl"><thead><tr><th>Date</th><th>What happened</th><th className="r">Amount</th><th className="r">Balance</th></tr></thead><tbody>
          {led.map(({ e, run }) => <tr key={e.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{fds(e.d)}</td><td><div>{e.desc}</div>{e.ref ? <div className="cell-sub num">{e.ref}</div> : null}</td>
            <td className={`r num ${e.amount < 0 ? 'neg' : ''}`}>{e.amount < 0 ? `−${rs(-e.amount)}` : rs(e.amount)}</td><td className="r num">{run < 0 ? `${rs(-run)} cr` : rs(run)}</td></tr>)}
        </tbody></table></div> : <p className="empty">Nothing on the account yet.</p>}
      </div>

      <div className="card" id="notes"><div className="card-row"><h3 data-hic="clip" data-tone="slate">Notes <small>{o.notes.length}</small></h3></div>
        {o.notes.length ? <div className="notes">{[...o.notes].reverse().map((n, i) => <div className="note" key={i}><div>{n.text}</div><div className="by">{n.by} · {fd(n.d)}</div></div>)}</div> : <p className="empty">No notes.</p>}
      </div>
    </>;
  });
}
