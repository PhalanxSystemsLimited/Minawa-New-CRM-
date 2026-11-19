// One photo with what it belongs to (21 Nov 2026): a payment (bank-transfer screen or bill receipt, taken at entry) or
// an electricity bill. Any role can open it for their own buildings; there is no list of all photos.
import { cur, ownerById, utilKind, awaitingApproval } from '@/lib/engine';
import { rs, fd, fm, t12 } from '@/lib/fmt';
import { Go } from '@/components/client';
import { Ic } from '@/components/icons';
import { Empty } from '@/components/views/art';
import { projectPage, projHead } from '@/components/views/project';
import { ownerHref } from '@/components/views/bits';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export default async function Photo({ params, searchParams }: { params: Promise<{ pid: string; id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid, id } = await params, sp = await searchParams;
  const rec = /^IMG[A-Za-z0-9_-]{6,30}$/.test(id) ? await (await getStore()).getImage(id).catch(() => null) : null;
  return projectPage(pid, sp, () => {
    const S = cur();
    if (!rec || rec.project !== pid) return <>{projHead('payments', 'Photo')}<Empty card kind="search" title="Photo not found">It may belong to another building, or the link is wrong.</Empty></>;
    const pay = S.payments.find(p => p.photoId === id), entry = S.proofs.find(p => p.photoId === id), bill = S.bills.find(b => b.photoId === id);
    const o = ownerById(pay?.ownerId || entry?.ownerId || bill?.ownerId || rec.ownerId || '');
    const rows: [string, React.ReactNode][] = [];
    if (o) rows.push(['Apartment', <Go key="a" href={ownerHref(o)}>{o.apt} · {o.name}</Go>]);
    if (pay) {
      rows.push(['Payment', `${rs(pay.amount)} · ${/bank/i.test(pay.method) ? 'Bank transfer' : 'Cash'} · ${fd(pay.d)} ${t12(pay.t)}`], ['Receipt', pay.receipt]);
      if (pay.txn) rows.push(['Bank transaction ID', pay.txn]);
      if (pay.forWhat === 'electricity') { const b = pay.billId ? S.bills.find(x => x.id === pay.billId) : null; rows.push(['For', b ? `${utilKind(b)} bill, ${fm(b.period)}` : 'Electricity']); }
      rows.push(['Entered by', pay.enteredBy || pay.by], ['Confirmed', pay.reversed ? `Taken back: ${pay.reversed.reason}` : awaitingApproval(pay) ? 'Waiting for the Accountant' : pay.approvedBy ? `by ${pay.approvedBy}` : '—']);
    } else if (entry) {
      rows.push(['Payment entry', `${rs(entry.amount)} · ${entry.method || 'Cash'} · ${fd(entry.d)}`], ['Status', entry.status === 'pending' ? 'Waiting for the Accountant' : entry.status === 'verified' ? 'Confirmed' : entry.status === 'rejected' ? 'Not received' : 'Cancelled']);
      if (entry.txn) rows.push(['Bank transaction ID', entry.txn]);
    }
    if (bill) rows.push(['Bill', `${utilKind(bill)} · ${fm(bill.period)} · ${rs(bill.net)}, due ${fd(bill.dueDate)}`], ['Paid', bill.paid >= bill.net ? 'Yes' : bill.paid > 0 ? `${rs(bill.paid)} of ${rs(bill.net)}` : 'Not yet']);
    rows.push(['Photo taken by', `${rec.byName} · ${fd(rec.at.slice(0, 10))}`], ['Size', `${rec.width && rec.height ? `${rec.width} × ${rec.height} px · ` : ''}${Math.max(1, Math.round(rec.bytes / 1024))} KB`]);
    return <>
      {projHead(bill ? 'electricity' : 'payments', 'Photo')}
      <div className="page-head"><div><h2>{bill ? 'Photo of the bill' : 'Photo of the payment'}</h2><p>{bill ? 'Printed on the bill PDF the customer gets on WhatsApp.' : 'Taken by the building manager when the payment was entered.'}</p></div>
        <a className="btn" href={`/api/img/${id}`} target="_blank" rel="noopener"><Ic n="ext" s={16} /> Open full size</a></div>
      <div className="ph-page">
        <div className="card ph-big"><a href={`/api/img/${id}`} target="_blank" rel="noopener"><img src={`/api/img/${id}`} alt={bill ? 'Photo of the bill' : 'Photo of the payment'} /></a></div>
        <div className="card"><h3>Details</h3><div className="kv ph-kv">{rows.map(([k, v]) => <div key={k}><span>{k}</span>{v}</div>)}</div>
          {pay ? <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}><a className="btn sm" href={`/api/pdf/${pid}/receipt/${encodeURIComponent(pay.id)}`} target="_blank" rel="noopener">Receipt PDF</a></div> : null}
          {bill ? <div style={{ marginTop: 12 }}><a className="btn sm" href={`/api/pdf/${pid}/bill/${encodeURIComponent(bill.id)}`} target="_blank" rel="noopener">Bill PDF</a></div> : null}</div>
      </div>
    </>;
  });
}
