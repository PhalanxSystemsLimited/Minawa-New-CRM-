'use client';
// The monthly utility bills grid: one row per flat. Typing units with a rate per unit fills the amount.
import { useState } from 'react';
import { Submit } from './client';

export interface GridRow { oid: string; apt: string; block: string; type: string; name: string; units: number | null; amount: number | null; billed: string | null; prev: number | null }

export function UtilityGrid({ rows, kind, action, pid, period }: { rows: GridRow[]; kind: string; action: (fd: FormData) => Promise<void>; pid: string; period: string }) {
  const [rate, setRate] = useState('');
  const [vals, setVals] = useState<Record<string, { u: string; a: string }>>(() => Object.fromEntries(rows.map(r => [r.oid, { u: r.units != null ? String(r.units) : '', a: r.amount != null ? String(r.amount) : '' }])));
  const [q, setQ] = useState('');
  const set = (oid: string, k: 'u' | 'a', v: string) => setVals(x => {
    const n = { ...x, [oid]: { ...x[oid], [k]: v } };
    if (k === 'u' && +rate > 0 && v !== '') n[oid].a = String(Math.round(+v * +rate));
    return n;
  });
  const total = Object.values(vals).reduce((s, v) => s + (+v.a || 0), 0), filled = rows.filter(r => r.billed || +vals[r.oid]?.a > 0).length;
  const show = rows.filter(r => !q || `${r.apt} ${r.name}`.toLowerCase().includes(q.toLowerCase()));
  return <form action={action}>
    <input type="hidden" name="pid" value={pid} /><input type="hidden" name="period" value={period} /><input type="hidden" name="kind" value={kind} />
    <div className="toolbar" style={{ marginBottom: 14 }}>
      <input className="search" type="search" placeholder="Find apartment or owner" value={q} onChange={e => setQ(e.target.value)} aria-label="Find apartment" />
      <label className="rate-in"><span>Rate per unit (Rs)</span><input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="optional" /></label>
    </div>
    <div className="tbl-wrap"><table className="ut-tbl"><thead><tr><th>Apartment</th><th>Owner</th><th className="r">Last month</th><th className="r">Units</th><th className="r">{kind} (Rs)</th><th>Status</th></tr></thead><tbody>
      {show.map(r => <tr key={r.oid} className={r.billed ? 'locked' : ''}>
        <td><div className="cell-main apt-t">{r.apt}</div><div className="cell-sub">Block {r.block} · {r.type}</div></td>
        <td>{r.name}</td>
        <td className="r num muted">{r.prev != null ? r.prev.toLocaleString('en-US') : '–'}</td>
        {r.billed ? <><td className="r num">{r.units ?? '–'}</td><td className="r num"><b>{(r.amount || 0).toLocaleString('en-US')}</b></td><td><span className="tag good">On bill {r.billed}</span></td></>
          : <><td className="r"><input className="num ut-in" name={`units:${r.oid}`} type="number" min="0" step="1" value={vals[r.oid]?.u || ''} onChange={e => set(r.oid, 'u', e.target.value)} aria-label={`${r.apt} units`} /></td>
            <td className="r"><input className="num ut-in" name={`amt:${r.oid}`} type="number" step="1" value={vals[r.oid]?.a || ''} onChange={e => set(r.oid, 'a', e.target.value)} aria-label={`${r.apt} ${kind} amount`} /></td>
            <td>{+vals[r.oid]?.a > 0 ? <span className="tag info">Goes on next bill</span> : <span className="tag">Not entered</span>}</td></>}
      </tr>)}
    </tbody><tfoot><tr><td colSpan={2}><strong>{filled} of {rows.length} flats entered</strong></td><td></td><td></td><td className="r num"><strong>Rs {total.toLocaleString('en-US')}</strong></td><td></td></tr></tfoot></table></div>
    <div className="m-actions ut-save"><span className="muted" style={{ fontSize: 12, marginRight: 'auto', alignSelf: 'center' }}>Leave a flat empty (or 0) to clear it. Flats already billed are locked; enter a correction next month.</span><Submit pendingText="Saving…">Save {kind.toLowerCase()} bills</Submit></div>
  </form>;
}
