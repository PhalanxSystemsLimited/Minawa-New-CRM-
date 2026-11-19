// Payments (the demo's viewPayments).
import { cur, ownerById, getTarget } from '@/lib/engine';
import { MONL, fm, fd, rs, prevMonth, t12 } from '@/lib/fmt';
import { payFiltered } from '@/lib/queries';
import { Ic } from '@/components/icons';
import { Go, A, LiveSearch } from '@/components/client';
import { projectPage, projHead, newPayments, payKey, paySeenCookie } from '@/components/views/project';
import { PayRows, MarkPaymentsSeen } from '@/components/PayRows';
import { when, viaHtml, ownerHref, PhotoLink } from '@/components/views/bits';
import { Empty } from '@/components/views/art';

export const dynamic = 'force-dynamic';


export default async function Payments({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), P = `/p/${pid}/payments`, per = sp.per || 'month', fam = sp.fam || 'all', mon = S.today.slice(0, 7), lm = prevMonth(mon);
    const pers: [string, string][] = [['month', MONL[+mon.slice(5) - 1]], ['last', MONL[+lm.slice(5) - 1]], ['all', 'All time']];
    const rows = payFiltered(per, fam, sp.q || ''), total = rows.reduce((s, p) => s + p.amount, 0);
    // New since this person last opened Payments here (the tab's badge); opening the page marks them as seen.
    const fresh = new Set(newPayments().map(p => p.id)), latest = S.payments.map(payKey).sort().pop() || null;
    const qs = (o: Record<string, string>) => { const u = new URLSearchParams({ per, fam, ...(sp.q ? { q: sp.q } : {}), ...o }); if (u.get('fam') === 'all') u.delete('fam'); return `${P}?${u}`; };
    const callout = (() => { if (per === 'all') return null; const p = per === 'month' ? mon : lm, t = getTarget(p), got = S.payments.filter(x => x.d.slice(0, 7) === p).reduce((s, x) => s + x.amount, 0), pc = t.total ? Math.round(100 * got / t.total) : 0;
      if (!t.total) return <div className="callout" style={{ marginBottom: 14 }}><Ic n="target" s={18} /><div><b>{rs(got)} collected in {fm(p)}</b>. There is no target for {fm(p)}: billing hasn&apos;t started yet, so these payments go against earlier dues.</div></div>;
      return <div className={`callout ${pc >= 100 ? 'good' : ''}`} style={{ marginBottom: 14 }}><Ic n="target" s={18} /><div><b>{fm(p)} target {rs(t.total)}</b> · {rs(got)} collected, {pc}%{pc >= 100 ? ', target met' : `, ${rs(t.total - got)} to go`}. <A href={`${P}?per=${per}&m=target`}>See how it&apos;s made up</A></div></div>; })();
    return <>
      {projHead('payments')}
      <div className="page-head"><div><h2>Payments</h2><p>Every payment: who paid, how much, how and when. Payments a building manager enters appear here once the Accountant confirms them. Click a payment to see all its details.</p></div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{S.role !== 'admin' ? <Go href={`/p/${pid}/apartments?f=owing`} className="btn primary">{S.role === 'manager' ? 'Enter a cash payment' : 'Record a cash payment'}</Go> : null}<a className="btn" href={`/api/export/payments?project=${pid}&per=${per}&fam=${fam}&q=${encodeURIComponent(sp.q || '')}`}>Export CSV</a></div></div>
      <MarkPaymentsSeen cookie={paySeenCookie(S.staffId || 'x', pid)} latest={latest} seen={S.paySeen || null} />
      {fresh.size ? <div className="callout good" style={{ marginBottom: 14 }}><div><b>{fresh.size} new payment{fresh.size === 1 ? '' : 's'}</b> since you last opened Payments. They&apos;re marked <b>New</b> below. Click a payment to see all its details.</div></div> : null}
      {callout}
      <div className="card"><div className="toolbar" style={{ marginBottom: 14 }}>
        <LiveSearch name="q" id="paySearch" placeholder="Search owner, apartment, receipt or reference" ariaLabel="Search payments" defaultValue={sp.q || ''} />
        {pers.map(([k, l]) => <Go key={k} href={qs({ per: k })} className="chipbtn" pressed={per === k} replace>{l}</Go>)}
      </div><div id="payTable">
        {!rows.length ? <Empty kind="pay" title="No payments match">Try another period or method.</Empty> :
          <div className="tbl-wrap"><table className="pay-table"><thead><tr><th style={{ width: 28 }}></th><th>When</th><th>Apartment</th><th className="r">Amount</th><th>Received</th><th>Receipt</th></tr></thead>
            <PayRows cols={5} rows={rows.map(p => { const o = ownerById(p.ownerId), isNew = fresh.has(p.id);
              const item = (l: string, v: React.ReactNode) => v === null || v === '' || v === undefined ? null : <div className="pd-i"><div className="l">{l}</div><div className="v">{v}</div></div>;
              return { key: p.id, isNew, cells: [
                <span key="w" className="num" style={{ whiteSpace: 'nowrap' }}>{when(p.d, p.t)}{isNew ? <> <span className="tag good">New</span></> : null}</span>,
                <span key="a"><A href={ownerHref(o)} className="apt-a">{o.apt}</A><div className="cell-sub">{o.name}</div></span>,
                <strong key="m">{rs(p.amount)}</strong>, <span key="v">{viaHtml(p)}</span>, <A key="r" href={qs({ doc: `receipt:${p.id}` })} className="rcpt">{p.receipt}</A>],
                detail: <div className="pd">
                  <div className="pd-grid">
                    {item('Owner', <>{o.name}{o.phone ? <div className="cell-sub">{o.phone}</div> : null}</>)}
                    {item('Apartment', <>{o.apt} · Block {o.block || '—'}<div className="cell-sub">{o.type} · {S.proj.name}</div></>)}
                    {item('Paid on', `${fd(p.d)}, ${t12(p.t)}`)}
                    {item('Amount', rs(p.amount))}
                    {item('Method', p.method)}
                    {item('Recorded', p.source === 'proof' ? `Confirmed: ${p.by}` : `By ${p.by}`)}
                    {item('Reference', p.ref)}
                    {item('Receipt', p.receipt)}
                    {p.photoId ? item('Photo', <PhotoLink pid={p.project} id={p.photoId} label="Open the photo" />) : null}
                    {item('Owed before', rs(p.before))}
                    {item('Owed after', p.balAfter < 0 ? `${rs(-p.balAfter)} credit` : p.balAfter ? rs(p.balAfter) : 'Nothing, paid up')}
                  </div>
                  {p.applied?.length ? <div className="pd-app"><div className="l">What it paid</div><ul>{p.applied.map((x, i) => <li key={i}><span>{x.label}</span><b className="num">{rs(x.amount)}</b></li>)}</ul></div> : null}
                  <div className="pd-act"><A href={qs({ doc: `receipt:${p.id}` })} className="btn sm">Receipt {p.receipt}</A><A href={ownerHref(o)} className="btn sm">Open apartment {o.apt}</A></div>
                </div> }; })} />
            <tfoot><tr><td></td><td colSpan={2}><strong>{rows.length} payment{rows.length === 1 ? '' : 's'}</strong></td><td className="r num"><strong>{rs(total)}</strong></td><td colSpan={2} className="cell-sub">{rows.filter(p => p.source === 'proof').length} entered by building managers</td></tr></tfoot></table></div>}
      </div></div>
    </>;
  });
}
