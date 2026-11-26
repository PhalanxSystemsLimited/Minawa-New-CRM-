'use client';
// Printed vouchers (20 Nov 2026): tick the customers, print their vouchers in one PDF, deliver them, then mark them
// delivered. A customer with nothing new waiting can still get a printed statement of dues (same list, below a divider).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { deliveredVouchersAction } from '@/lib/actions-send';
import { Ic } from './icons';

export interface VRow { oid: string; apt: string; block: string; name: string; why: string; bal: string; owes: boolean; items: { key: string; ids: string[]; what: string; since: string }[] }

export function VoucherBatch({ pid, rows }: { pid: string; rows: VRow[] }) {
  const router = useRouter();
  const waiting = useMemo(() => rows.filter(r => r.items.length), [rows]), others = useMemo(() => rows.filter(r => !r.items.length), [rows]);
  const [sel, setSel] = useState<Set<string>>(() => new Set(waiting.map(r => r.oid)));
  const [extra, setExtra] = useState<Set<string>>(new Set()), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const picked = waiting.filter(r => sel.has(r.oid)), pickedOthers = others.filter(r => extra.has(r.oid));
  const selParam = [...picked.flatMap(r => r.items.map(i => `m:${i.key}`)), ...pickedOthers.map(r => `o:${r.oid}`)].join(',');
  const flip = (s: Set<string>, set: (x: Set<string>) => void, id: string) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); set(n); };
  const delivered = async () => {
    if (!picked.length) return;
    setBusy(true); setErr(''); setMsg('');
    const r = await deliveredVouchersAction({ pid, ids: picked.flatMap(x => x.items.flatMap(i => i.ids)) }).catch(() => ({ ok: false, n: 0, error: 'Not saved. Try again.' }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || 'Not saved. Try again.'); return; }
    setMsg(`${r.n} customer${r.n === 1 ? '' : 's'} marked as delivered.`); router.refresh();
  };
  const nPapers = waiting.reduce((a, r) => a + r.items.length, 0), nTicked = picked.length + pickedOthers.length;
  const fix = (r: VRow) => <a className="btn sm" href={`/p/${pid}/apartments/${r.oid}?m=fix`} onClick={e => e.stopPropagation()}>{r.why === 'No WhatsApp number' ? 'Add number' : 'Fix number'}</a>;
  // 26 Nov 2026: one list. Customers with a paper waiting come first (ticked, and "Mark delivered" counts only them);
  // the rest follow under a divider, unticked: tick any of them to print a statement of dues too.
  return <div className="card vb-card">
    <div className="card-row"><h3 data-hic="print" data-tone="violet">Customers without WhatsApp <small>{rows.length} customer{rows.length === 1 ? '' : 's'} · {nPapers} paper{nPapers === 1 ? '' : 's'} waiting</small></h3>
      <div className="vb-acts">
        <a className={'btn sm primary' + (selParam ? '' : ' disabled')} aria-disabled={!selParam} href={selParam ? `/api/pdf/${pid}/vouchers?sel=${encodeURIComponent(selParam)}` : undefined} target="_blank" rel="noopener"><Ic n="print" s={15} /> Print {nTicked || ''} (PDF)</a>
        <button type="button" className="btn sm" disabled={!picked.length || busy} onClick={delivered}><Ic n="tick" s={15} /> {busy ? 'Saving…' : `Mark ${picked.length || ''} delivered`}</button></div></div>
    {msg ? <div className="callout good" style={{ marginBottom: 10 }}><div>{msg}</div></div> : null}
    {err ? <div className="callout bad" style={{ marginBottom: 10 }}><div>{err}</div></div> : null}
    <div className="list vb-list">
      {waiting.length ? <>
        <label className="li vb-all"><input type="checkbox" checked={picked.length === waiting.length} onChange={e => setSel(new Set(e.target.checked ? waiting.map(r => r.oid) : []))} /> <b>Paper waiting · all {waiting.length}</b></label>
        {waiting.map(r => <label className="li vb-li" key={r.oid}><input type="checkbox" checked={sel.has(r.oid)} onChange={() => flip(sel, setSel, r.oid)} />
          <div className="t"><div className="a"><span className="apt-t">{r.apt}</span> · {r.name} <span className="tag warn">{r.why}</span></div>
            <div className="b">{r.items.map(i => i.what).join('; ')} · waiting since {r.items.map(i => i.since).sort()[0]}</div></div>
          <span className="num vb-bal">{r.bal}</span>{fix(r)}</label>)}
      </> : <p className="empty">Nothing waiting: every customer without WhatsApp has their papers.</p>}
      {others.length ? <>
        <div className="vb-div"><span>Nothing new waiting · tick to print a statement of dues</span></div>
        {others.map(r => <label className="li vb-li vb-opt" key={r.oid}><input type="checkbox" checked={extra.has(r.oid)} onChange={() => flip(extra, setExtra, r.oid)} />
          <div className="t"><div className="a"><span className="apt-t">{r.apt}</span> · {r.name} <span className="tag">{r.why}</span></div><div className="b">{r.owes ? 'Statement of dues' : 'Nothing owed'}</div></div>
          <span className="num vb-bal">{r.bal}</span>{fix(r)}</label>)}
      </> : null}
    </div>
    <p className="cell-sub" style={{ margin: '10px 0 0' }}>Print, deliver by hand (or leave at the flat), then mark them delivered: they leave the top of this list and the customer&apos;s history shows &quot;printed and delivered&quot;. Statements printed for the others are not marked delivered. Once a customer&apos;s WhatsApp number is added, their messages go on WhatsApp again.</p>
  </div>;
}
