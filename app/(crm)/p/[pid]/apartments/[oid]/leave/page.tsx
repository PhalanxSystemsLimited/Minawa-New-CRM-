// A customer leaving / handing back the keys (Phase 3, 18 Nov 2026). The building manager picks the leaving date (and
// the meter reading at Oakwood). The CRM works out the final figures up to that day: if anything is unpaid, leaving is
// blocked ("Charges are not cleared") with a report of what was paid and what is still due; once everything is paid,
// the request goes to the Admin. After approval the apartment is vacant (no bills) and the "All charges cleared"
// report is here, printable and as CSV.
import { cur, ownerById, currentOf, leaveFigures, billsOf, sortedPayments, periodLabel, isAdmin, balance } from '@/lib/engine';
import { pendingFor } from '@/lib/approvals';
import { leaveAction } from '@/lib/actions-desk';
import { projectPage, projHead } from '@/components/views/project';
import { Go, Submit, PrintBtn } from '@/components/client';
import { fd, fds, rs } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

export default async function Leave({ params, searchParams }: { params: Promise<{ pid: string; oid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid, oid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), sel = ownerById(oid);
    if (!sel) return <>{projHead('owners')}<p className="empty">Apartment not found.</p></>;
    const o = sel.status === 'closed' ? sel : currentOf(sel), base = `/p/${pid}/apartments/${o.id}`, elec = S.settings.rules.utilities.includes('Electricity');
    const bills = billsOf(o), pays = sortedPayments().filter(p => p.ownerId === o.id).reverse();
    const billed = bills.reduce((a, b) => a + b.net, 0), paid = pays.reduce((a, p) => a + p.amount, 0);
    const payTable = <div className="tbl-wrap"><table><thead><tr><th>Date</th><th className="r">Amount</th><th>Received as</th><th>Receipt</th><th>Entered by</th><th>Approved by</th></tr></thead><tbody>
      {pays.length ? pays.map(p => <tr key={p.id}><td>{fd(p.d)}</td><td className="r num">{rs(p.amount)}</td><td>{p.method}</td><td>{p.receipt}</td><td>{p.enteredBy || p.by}</td><td>{p.approvedBy || ''}</td></tr>)
        : <tr><td colSpan={6} className="cell-sub">No payments in the CRM yet.</td></tr>}
    </tbody></table></div>;
    const head = <>{projHead('owners', `${o.apt} · Customer left`)}
      <div className="page-head"><div><h2>{o.status === 'closed' ? 'All charges cleared' : 'Customer left'}: {o.apt}</h2><p>{o.name} · in possession since {o.possessionKnown ? fd(o.possession) : 'before the office list'}{o.meterIn ? ` · meter at possession ${o.meterIn.reading} (${fds(o.meterIn.d)})` : ''}</p></div>
        <div style={{ display: 'flex', gap: 8 }} className="no-print"><Go href={base} className="btn">Back to the apartment</Go></div></div></>;

    // Already left: the clearance report.
    if (o.status === 'closed') {
      const c = S.clearances.find(x => x.ownerId === o.id);
      return <>{head}
        <div className="rpt">
          <div className="print-only"><h2 style={{ margin: '0 0 4px' }}>All charges cleared · {o.apt}, {S.proj.name}</h2><p className="muted">{o.name} · printed {fd(S.today)}</p></div>
          <div className="callout good"><div><b>{o.name} left {o.apt} on {o.closedOn ? fd(o.closedOn) : '—'} with all charges cleared.</b> {c ? `Dues Clearance certificate ${c.no}.` : ''} {balance(o) < 0 ? `${rs(-balance(o))} advance to refund.` : ''} The apartment is vacant and isn&apos;t billed until the next possession.</div></div>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div className="kpi"><div className="l">Possession</div><div className="v">{o.possessionKnown ? fds(o.possession) : '—'}</div><div className="cell-sub">to {o.closedOn ? fd(o.closedOn) : '—'}</div></div>
            <div className="kpi"><div className="l">Billed in the CRM</div><div className="v num">{rs(billed)}</div><div className="cell-sub">{bills.length} bill{bills.length === 1 ? '' : 's'}</div></div>
            <div className="kpi"><div className="l">Paid</div><div className="v num">{rs(paid)}</div><div className="cell-sub">{pays.length} payment{pays.length === 1 ? '' : 's'}</div></div>
            {o.meterIn || o.meterOut ? <div className="kpi"><div className="l">Meter</div><div className="v num">{o.meterIn?.reading ?? '—'} → {o.meterOut?.reading ?? '—'}</div><div className="cell-sub">at possession → at leaving</div></div> : null}
          </div>
          <div className="card"><div className="card-row"><h3>Payments</h3><div className="no-print" style={{ display: 'flex', gap: 8 }}><a className="btn sm" href={`/api/pdf/${pid}/history/${o.id}`} target="_blank" rel="noopener">Payment history (PDF)</a><a className="btn sm" href={`/api/export/leave?project=${pid}&oid=${o.id}`}>Download CSV</a><PrintBtn className="btn sm">Print</PrintBtn></div></div>{payTable}</div>
        </div></>;
    }

    const L = /^\d{4}-\d{2}-\d{2}$/.test(sp.d || '') && sp.d! <= S.today ? sp.d! : S.today;
    const f = leaveFigures(o, L), waiting = pendingFor(o).find(a => a.kind === 'leave');
    const unpaidBills = bills.filter(b => b.net - b.paid > 0);
    return <>{head}
      <form method="get" className="card no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-row" style={{ margin: 0 }}><label htmlFor="lv-d">Leaving date (keys handed back)</label><input id="lv-d" name="d" type="date" defaultValue={L} max={S.today} min={o.possessionKnown ? o.possession : undefined} /></div>
        <button type="submit" className="btn">Check the charges</button>
      </form>
      <div className="rpt">
        <div className="print-only"><h2 style={{ margin: '0 0 4px' }}>Charges before leaving · {o.apt}, {S.proj.name}</h2><p className="muted">{o.name} · leaving {fd(L)} · printed {fd(S.today)}</p></div>
        <div className="card"><div className="card-row"><h3>Final figures up to {fd(L)}</h3><div className="no-print" style={{ display: 'flex', gap: 8 }}><a className="btn sm" href={`/api/export/leave?project=${pid}&oid=${o.id}&d=${L}`}>Download CSV</a><PrintBtn className="btn sm">Print</PrintBtn></div></div>
          <div className="tbl-wrap"><table><tbody>
            <tr><td>Balance now (bills, earlier dues and fines, less payments)</td><td className="r num">{rs(f.balance)}</td></tr>
            {f.unbilled ? <tr><td>Maintenance from {f.uFrom ? fds(f.uFrom) : ''} to {f.uTo ? fds(f.uTo) : ''} not billed yet</td><td className="r num">+ {rs(f.unbilled)}</td></tr> : null}
            {f.unused.map(u => <tr key={u.b.id}><td>Credit: {u.days} day{u.days === 1 ? '' : 's'} of the {periodLabel(u.b)} bill after leaving</td><td className="r num">− {rs(u.amount)}</td></tr>)}
            <tr><td><b>{f.due > 0 ? 'Still to pay before leaving' : f.due < 0 ? 'Advance to refund' : 'Nothing to pay'}</b></td><td className="r num"><b>{rs(Math.abs(f.due))}</b></td></tr>
          </tbody></table></div></div>
        {f.due > 0 ? <>
          <div className="callout bad"><div><b>Charges are not cleared. Please clear all charges first.</b> {o.name} has to pay {rs(f.due)} before leaving {o.apt}. Enter the payment; once the Accountant approves it, come back here.</div></div>
          <div className="card"><div className="card-row"><h3>Still unpaid</h3>{S.role !== 'admin' ? <Go href={`${base}?m=recpay`} className="btn sm primary no-print">Enter payment</Go> : null}</div>
            <div className="tbl-wrap"><table><thead><tr><th>Bill</th><th>Due</th><th className="r">Amount</th><th className="r">Paid</th><th className="r">Unpaid</th></tr></thead><tbody>
              {o.openingLeft > 0 ? <tr><td>Earlier dues (office list)</td><td>—</td><td className="r num">{rs(o.opening)}</td><td className="r num">{rs(o.opening - o.openingLeft)}</td><td className="r num">{rs(o.openingLeft)}</td></tr> : null}
              {unpaidBills.map(b => <tr key={b.id}><td>{periodLabel(b)}</td><td>{fds(b.dueDate)}</td><td className="r num">{rs(b.net)}</td><td className="r num">{rs(b.paid)}</td><td className="r num">{rs(b.net - b.paid)}</td></tr>)}
              {o.feeDue > 0 ? <tr><td>Fine</td><td>—</td><td className="r num">{rs(o.feeDue)}</td><td></td><td className="r num">{rs(o.feeDue)}</td></tr> : null}
              {f.unbilled ? <tr><td>Maintenance up to the leaving date</td><td>—</td><td className="r num">{rs(f.unbilled)}</td><td></td><td className="r num">{rs(f.unbilled)}</td></tr> : null}
            </tbody></table></div></div>
          <div className="card"><div className="card-row"><h3>Payments made</h3></div>{payTable}</div>
        </> : waiting ? <div className="callout warn"><div><b>Waiting for the Admin.</b> {waiting.summary}</div></div>
          : S.role === 'accountant' ? <div className="callout good"><div><b>All charges are cleared.</b> The building manager records the customer leaving; the Admin approves it.</div></div>
          : <form action={leaveAction} className="card no-print"><input type="hidden" name="pid" value={pid} /><input type="hidden" name="oid" value={o.id} /><input type="hidden" name="date" value={L} />
            <div className="callout good" style={{ marginBottom: 12 }}><div><b>All charges are cleared up to {fd(L)}.</b> {f.due < 0 ? `${rs(-f.due)} is an advance to refund. ` : ''}Once {isAdmin() ? 'you confirm' : 'the Admin approves'}, {o.apt} becomes vacant and isn&apos;t billed until the next possession; the Dues Clearance certificate is issued.</div></div>
            {elec ? <div className="form-row"><label htmlFor="lv-r">Electricity meter reading at leaving</label><input id="lv-r" name="reading" type="number" min={o.meterIn?.reading ?? 0} step="1" required placeholder={o.meterIn ? `at possession: ${o.meterIn.reading}` : 'e.g. 15890'} /></div> : null}
            <div className="form-row"><label htmlFor="lv-n">Note{isAdmin() ? ' (optional)' : ' for the Admin'}</label><input id="lv-n" name="reason" type="text" required={!isAdmin()} placeholder="e.g. Keys handed back to the site office" /></div>
            <div className="m-actions"><Submit>{isAdmin() ? 'Confirm: customer left' : 'Send for approval'}</Submit></div>
          </form>}
      </div>
    </>;
  });
}
