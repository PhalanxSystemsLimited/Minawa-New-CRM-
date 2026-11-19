// Received payments (18 Nov 2026): every payment in the person's buildings, with who entered it, who approved it
// (since 19 Nov 2026 a payment counts from the moment it is entered; the Accountant's approval confirms the money)
// and the customer it belongs to. Admin (all buildings) and Accountants; CSV export and print.
import { requireRole, roleName } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { receivedRows } from '@/lib/received';
import { Go, PrintBtn } from '@/components/client';
import { fds, fm, rs, todayPKT, t12, prevMonth } from '@/lib/fmt';
import { PageIc, KIc, Empty } from '@/components/views/art';
import { Ic } from '@/components/icons';
import { PhotoLink } from '@/components/views/bits';

export const dynamic = 'force-dynamic';

export default async function Received({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, me = await requireRole('admin', 'accountant'), today = todayPKT();
  const all = await liveProjects(me), pid = all.some(p => p.id === sp.p) ? sp.p! : '';
  const month = /^\d{4}-\d{2}$/.test(sp.month || '') ? sp.month! : today.slice(0, 7);
  const via = sp.via === 'Cash' || sp.via === 'Bank transfer' ? sp.via : '';
  const states = await Promise.all((pid ? all.filter(p => p.id === pid) : all).map(p => load(p.id, me)));
  const rows = receivedRows(states, { month, via, who: sp.who || '' });
  const total = rows.reduce((a, r) => a + r.p.amount, 0), cashRows = rows.filter(r => r.via === 'Cash'), cash = cashRows.reduce((a, r) => a + r.p.amount, 0);
  const people = [...new Set(receivedRows(states, { month }).flatMap(r => [r.enteredBy, r.approvedBy]).filter(Boolean))].sort();
  const qs = new URLSearchParams(Object.entries({ project: pid, month, via, who: sp.who || '' }).filter(([, v]) => v)).toString();
  return <>
    <div className="proj-head"><PageIc n="receipt" tone="green" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Received payments</div></div><div className="crumb-path">Dashboard<span>/</span>Received payments</div></div>
    <p className="muted" style={{ margin: 0 }}>Every payment received. A payment counts for the customer the moment it is entered, with its receipt; the Accountant&apos;s approval confirms the money reached him. Each shows who entered it and who approved it.</p>
    <form method="get" className="card no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div className="form-row" style={{ margin: 0 }}><label htmlFor="rv-p">Building</label><select id="rv-p" name="p" defaultValue={pid}><option value="">All your buildings</option>{all.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="form-row" style={{ margin: 0 }}><label htmlFor="rv-m">Month</label><input id="rv-m" name="month" type="month" defaultValue={month} max={today.slice(0, 7)} /></div>
      <div className="form-row" style={{ margin: 0 }}><label htmlFor="rv-v">Received as</label><select id="rv-v" name="via" defaultValue={via}><option value="">Cash and bank</option><option>Cash</option><option>Bank transfer</option></select></div>
      <div className="form-row" style={{ margin: 0 }}><label htmlFor="rv-w">Entered or approved by</label><select id="rv-w" name="who" defaultValue={sp.who || ''}><option value="">Anyone</option>{people.map(x => <option key={x}>{x}</option>)}</select></div>
      <button type="submit" className="btn">Show</button><span style={{ flex: 1 }} />
      <a className="btn" href={`/api/export/received?${qs}`}><Ic n="download" s={15} /> Download CSV</a><PrintBtn><Ic n="print" s={15} /> Print</PrintBtn>
    </form>
    <div className="rpt">
      <div className="print-only"><h2 style={{ margin: '0 0 4px' }}>Received payments · {fm(month)}</h2><p className="muted" style={{ margin: '0 0 12px' }}>{pid ? all.find(p => p.id === pid)?.name : 'All buildings'}</p></div>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="kpi"><KIc n="cash" tone="green" /><div className="l">Received in {fm(month)}</div><div className="v num">{rs(total)}</div><div className="cell-sub">{rows.length} payment{rows.length === 1 ? '' : 's'}</div></div>
        <div className="kpi"><KIc n="cash" tone="green" /><div className="l">Cash</div><div className="v num">{rs(cash)}</div><div className="cell-sub">{cashRows.length} payment{cashRows.length === 1 ? '' : 's'}</div></div>
        <div className="kpi"><KIc n="bank" tone="blue" /><div className="l">Bank transfer</div><div className="v num">{rs(total - cash)}</div><div className="cell-sub">{rows.length - cashRows.length} payment{rows.length - cashRows.length === 1 ? '' : 's'}</div></div>
      </div>
      <div className="card"><div className="card-row"><h3>Payments <small>newest first</small></h3><Go href={`/received?${new URLSearchParams({ ...(pid ? { p: pid } : {}), month: prevMonth(month) })}`} className="btn sm no-print">← {fm(prevMonth(month))}</Go></div>
        {rows.length ? <div className="tbl-wrap"><table><thead><tr><th>Date</th><th>Apartment</th><th>Customer</th>{pid ? null : <th>Building</th>}<th className="r">Amount</th><th>Received as</th><th>Entered by</th><th>Approved by</th><th>Receipt</th></tr></thead><tbody>
          {rows.map(r => <tr key={r.p.project + r.p.id}><td style={{ whiteSpace: 'nowrap' }}>{fds(r.p.d)} <span className="cell-sub">{t12(r.p.t)}</span></td>
            <td><Go href={`/p/${r.p.project}/apartments/${r.p.ownerId}?tab=payments`} className="link-btn"><b>{r.apt}</b></Go></td><td>{r.owner}</td>{pid ? null : <td>{r.pname}</td>}
            <td className="r num"><b>{rs(r.p.amount)}</b></td><td>{r.via === 'Cash' ? <span className="tag warn">Cash</span> : <span className="tag info">Bank</span>}{r.p.txn ? <div className="cell-sub">{r.p.txn}</div> : null}{r.p.photoId ? <PhotoLink pid={r.p.project} id={r.p.photoId} /> : null}</td>
            <td>{r.enteredBy}</td><td>{r.approvedBy || <span className="tag warn">Waiting for the Accountant</span>}{r.p.approvedAt ? <div className="cell-sub">{fds(r.p.approvedAt.slice(0, 10))}</div> : null}</td><td>{r.p.receipt}{r.p.ref ? <div className="cell-sub">{r.p.ref}</div> : null}</td></tr>)}
        </tbody></table></div> : <Empty kind="pay" title={`No payments in ${fm(month)}${via || sp.who ? ' with these filters' : ''}`} />}
      </div>
    </div>
  </>;
}
