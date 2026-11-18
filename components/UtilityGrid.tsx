'use client';
// The monthly utility bills grid: one row per flat. Electricity (Oakwood, Phase 3): the previous meter reading is filled
// in (last month's reading, or the reading at possession), the building manager types the current reading; units are
// worked out, and with a rate per unit the amount too (the amount from the paper bill can always be typed).
import { useState } from 'react';
import { Submit } from './client';

export interface GridRow { oid: string; apt: string; block: string; type: string; name: string; units: number | null; amount: number | null; billed: string | null; prev: number | null;
  prevReading: number | null; curReading: number | null }

type V = { p: string; c: string; u: string; a: string };
export function UtilityGrid({ rows, kind, action, pid, period, due, readings }: { rows: GridRow[]; kind: string; action: (fd: FormData) => Promise<void>; pid: string; period: string; due: string; readings: boolean }) {
  const [rate, setRate] = useState('');
  const s = (x: number | null) => x != null ? String(x) : '';
  const [vals, setVals] = useState<Record<string, V>>(() => Object.fromEntries(rows.map(r => [r.oid, { p: s(r.prevReading), c: s(r.curReading), u: s(r.units), a: s(r.amount) }])));
  const [q, setQ] = useState('');
  const set = (oid: string, k: keyof V, v: string) => setVals(x => {
    const n = { ...x, [oid]: { ...x[oid], [k]: v } }, r = n[oid];
    if ((k === 'p' || k === 'c') && r.p !== '' && r.c !== '' && +r.c >= +r.p) r.u = String(+r.c - +r.p);
    if ((k === 'u' || k === 'p' || k === 'c') && +rate > 0 && r.u !== '') r.a = String(Math.round(+r.u * +rate));
    return n;
  });
  const total = Object.values(vals).reduce((t, v) => t + (+v.a || 0), 0), filled = rows.filter(r => r.billed || +vals[r.oid]?.a > 0).length;
  const show = rows.filter(r => !q || `${r.apt} ${r.name}`.toLowerCase().includes(q.toLowerCase()));
  return <form action={action}>
    <input type="hidden" name="pid" value={pid} /><input type="hidden" name="period" value={period} /><input type="hidden" name="kind" value={kind} />
    <div className="toolbar" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
      <input className="search" type="search" placeholder="Find apartment or owner" value={q} onChange={e => setQ(e.target.value)} aria-label="Find apartment" />
      <label className="rate-in"><span>Rate per unit (Rs)</span><input type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="optional" /></label>
      <label className="rate-in"><span>Due date for these bills</span><input type="date" name="due" defaultValue={due} required /></label>
    </div>
    <div className="tbl-wrap"><table className="ut-tbl"><thead><tr><th>Apartment</th><th>Owner</th>{readings ? <><th className="r">Previous reading</th><th className="r">Current reading</th></> : <th className="r">Last month</th>}<th className="r">Units</th><th className="r">{kind} (Rs)</th><th>Status</th></tr></thead><tbody>
      {show.map(r => <tr key={r.oid} className={r.billed ? 'locked' : ''}>
        <td><div className="cell-main apt-t">{r.apt}</div><div className="cell-sub">Block {r.block} · {r.type}</div></td>
        <td>{r.name}</td>
        {r.billed ? <>{readings ? <><td className="r num">{r.prevReading ?? '–'}</td><td className="r num">{r.curReading ?? '–'}</td></> : <td className="r num muted">{r.prev != null ? r.prev.toLocaleString('en-US') : '–'}</td>}
          <td className="r num">{r.units ?? '–'}</td><td className="r num"><b>{(r.amount || 0).toLocaleString('en-US')}</b></td><td><span className="tag good">Billed · {r.billed}</span></td></>
          : <>{readings ? <><td className="r"><input className="num ut-in" name={`prev:${r.oid}`} type="number" min="0" step="1" value={vals[r.oid]?.p || ''} onChange={e => set(r.oid, 'p', e.target.value)} aria-label={`${r.apt} previous reading`} /></td>
              <td className="r"><input className="num ut-in" name={`cur:${r.oid}`} type="number" min="0" step="1" value={vals[r.oid]?.c || ''} onChange={e => set(r.oid, 'c', e.target.value)} aria-label={`${r.apt} current reading`} /></td></>
            : <td className="r num muted">{r.prev != null ? r.prev.toLocaleString('en-US') : '–'}</td>}
            <td className="r"><input className="num ut-in" name={`units:${r.oid}`} type="number" min="0" step="1" value={vals[r.oid]?.u || ''} onChange={e => set(r.oid, 'u', e.target.value)} aria-label={`${r.apt} units`} /></td>
            <td className="r"><input className="num ut-in" name={`amt:${r.oid}`} type="number" step="1" value={vals[r.oid]?.a || ''} onChange={e => set(r.oid, 'a', e.target.value)} aria-label={`${r.apt} ${kind} amount`} /></td>
            <td>{+vals[r.oid]?.a > 0 ? <span className="tag info">Bill made on save</span> : <span className="tag">Not entered</span>}</td></>}
      </tr>)}
    </tbody><tfoot><tr><td colSpan={readings ? 5 : 4}><strong>{filled} of {rows.length} flats entered</strong></td><td className="r num"><strong>Rs {total.toLocaleString('en-US')}</strong></td><td></td></tr></tfoot></table></div>
    <div className="m-actions ut-save"><span className="muted" style={{ fontSize: 12, marginRight: 'auto', alignSelf: 'center' }}>Saving makes each flat&apos;s {kind.toLowerCase()} bill at once and puts &quot;send {kind.toLowerCase()} bill&quot; in your To do. Billed flats are locked; enter a correction as an adjustment.</span><Submit pendingText="Saving…">Save and make {kind.toLowerCase()} bills</Submit></div>
  </form>;
}
