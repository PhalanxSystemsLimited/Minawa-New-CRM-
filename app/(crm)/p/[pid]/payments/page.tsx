// Payments (the demo's viewPayments).
import { cur, ownerById, getTarget } from '@/lib/engine';
import { MONL, fm, rs, prevMonth } from '@/lib/fmt';
import { spInfo } from '@/lib/docdata';
import { payFiltered } from '@/lib/queries';
import { Ic } from '@/components/icons';
import { Go, A, LiveSearch, GoSelect } from '@/components/client';
import { projectPage, projHead } from '@/components/views/project';
import { when, viaHtml, ownerHref } from '@/components/views/bits';

export const dynamic = 'force-dynamic';
const FAMS = ['Card', 'Bank'] as const;
const FAM_LABEL: Record<string, string> = { Card: 'Safepay received (Pay Now)', Bank: 'Bank (recorded by staff)' };

export default async function Payments({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), P = `/p/${pid}/payments`, per = sp.per || 'month', fam = sp.fam || 'all', mon = S.today.slice(0, 7), lm = prevMonth(mon);
    const pers: [string, string][] = [['month', MONL[+mon.slice(5) - 1]], ['last', MONL[+lm.slice(5) - 1]], ['all', 'All time']];
    const rows = payFiltered(per, fam, sp.q || ''), total = rows.reduce((s, p) => s + p.amount, 0);
    const qs = (o: Record<string, string>) => { const u = new URLSearchParams({ per, fam, ...(sp.q ? { q: sp.q } : {}), ...o }); if (u.get('fam') === 'all') u.delete('fam'); return `${P}?${u}`; };
    const callout = (() => { if (per === 'all') return null; const p = per === 'month' ? mon : lm, t = getTarget(p), got = S.payments.filter(x => x.d.slice(0, 7) === p).reduce((s, x) => s + x.amount, 0), pc = t.total ? Math.round(100 * got / t.total) : 0;
      return <div className={`callout ${pc >= 100 ? 'good' : ''}`} style={{ marginBottom: 14 }}><Ic n="target" s={18} /><div><b>{fm(p)} target {rs(t.total)}</b> · {rs(got)} collected, {pc}%{pc >= 100 ? ', target met' : `, ${rs(t.total - got)} to go`}. <A href={`${P}?per=${per}&m=target`}>See how it&apos;s made up</A></div></div>; })();
    return <>
      {projHead('payments')}
      <div className="page-head"><div><h2>Payments</h2><p>Every payment: who paid, how much, how and when. Pay Now payments show <b>Safepay received</b> once Safepay confirms them. Tap a receipt number for the receipt.</p></div><a className="btn" href={`/api/export/payments?project=${pid}&per=${per}&fam=${fam}&q=${encodeURIComponent(sp.q || '')}`}>Export CSV</a></div>
      {callout}
      <div className="card"><div className="toolbar" style={{ marginBottom: 14 }}>
        <LiveSearch name="q" id="paySearch" placeholder="Search owner, apartment, receipt or Safepay tracker" ariaLabel="Search payments" defaultValue={sp.q || ''} />
        {pers.map(([k, l]) => <Go key={k} href={qs({ per: k })} className="chipbtn" pressed={per === k} replace>{l}</Go>)}
        <GoSelect name="fam" id="payFam" style={{ width: 'auto' }} ariaLabel="Payment method" value={fam} options={[['all', 'All methods'], ...FAMS.map(f => [f, FAM_LABEL[f]] as [string, string])]} />
      </div><div id="payTable">
        {!rows.length ? <p className="empty">No payments match. Try another period or method.</p> :
          <div className="tbl-wrap"><table><thead><tr><th>When</th><th>Apartment</th><th className="r">Amount</th><th>Received</th><th>Receipt</th></tr></thead><tbody>
            {rows.map(p => { const o = ownerById(p.ownerId);
              return <tr key={p.id}><td className="num" style={{ whiteSpace: 'nowrap' }}>{when(p.d, p.t)}</td><td><A href={ownerHref(o)} className="apt-a">{o.apt}</A><div className="cell-sub">{o.name}</div></td><td className="r num"><strong>{rs(p.amount)}</strong></td><td>{viaHtml(p)}</td><td><A href={qs({ doc: `receipt:${p.id}` })} className="rcpt">{p.receipt}</A></td></tr>; })}
          </tbody><tfoot><tr><td colSpan={2}><strong>{rows.length} payment{rows.length === 1 ? '' : 's'}</strong></td><td className="r num"><strong>{rs(total)}</strong></td><td colSpan={2} className="cell-sub">{rows.filter(p => spInfo(p)).length} through Safepay</td></tr></tfoot></table></div>}
      </div></div>
    </>;
  });
}
