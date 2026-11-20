'use client';
// Enter readings (21 Nov 2026, sub-meters): one row per customer with the last reading (from the last bill, or the
// reading at possession), a box for this month's reading, and the units and amount worked out as it is typed
// (units x the Admin's unit rate). A reading lower than the last one is stopped; much more use than usual only warns.
// Saving bills every flat with a reading; the rest are left for later. A flat with no earlier reading asks for it.
import { useMemo, useState } from 'react';
import { Go, Submit } from './client';
import { Ic } from './icons';
import { saveReadingsAction } from '@/lib/actions-elec';

export interface MeterRow { oid: string; apt: string; sub: string; name: string; cid: string; prev: number | null; prevFrom: string; avg: number | null;
  billed: null | { net: string; units: number | null; cur: number | null; locked: boolean; editHref: string }; photoHref: string }

const rs = (n: number) => 'Rs ' + Math.round(n).toLocaleString('en-US');

export function MeterGrid({ pid, period, periodLabel, rate, rows, q }: { pid: string; period: string; periodLabel: string; rate: number; rows: MeterRow[]; q: string }) {
  const [vals, setVals] = useState<Record<string, { prev?: string; cur?: string }>>({});
  const set = (oid: string, k: 'prev' | 'cur', v: string) => setVals(x => ({ ...x, [oid]: { ...x[oid], [k]: v.replace(/[^\d]/g, '') } }));
  const calc = (r: MeterRow) => {
    const v = vals[r.oid] || {}, cur = v.cur ? +v.cur : null, prev = r.prev ?? (v.prev ? +v.prev : null);
    if (cur == null) return null;
    if (prev == null) return { bad: 'Enter the previous reading too' };
    if (cur < prev) return { bad: `Lower than the last reading (${prev})` };
    const units = cur - prev, amount = units * rate;
    return { units, amount, warn: r.avg && units > Math.max(30, r.avg * 3) ? `Much more than usual (about ${Math.round(r.avg)} units)` : units === 0 ? 'No units used: nothing to bill' : '' };
  };
  const ready = useMemo(() => rows.filter(r => { const c = calc(r); return c && !('bad' in c) && c.units! > 0; }), [rows, vals]);   // eslint-disable-line react-hooks/exhaustive-deps
  const bad = rows.filter(r => { const c = calc(r); return c && 'bad' in c; }).length;
  const total = ready.reduce((a, r) => a + (calc(r) as { amount: number }).amount, 0);
  return <form action={saveReadingsAction} className="meter-form">
    <input type="hidden" name="pid" value={pid} /><input type="hidden" name="period" value={period} />{q ? <input type="hidden" name="q" value={q} /> : null}
    <div className="tbl-wrap" data-nocap><table className="el-tbl meter-tbl"><thead><tr><th>Apartment</th><th>Customer</th><th className="r">Last reading</th><th className="r">Reading now</th><th className="r">Units · amount</th><th></th></tr></thead><tbody>
      {rows.map(r => { const c = calc(r), v = vals[r.oid] || {};
        return <tr key={r.oid} className={c && 'bad' in c ? 'm-bad' : undefined}>
          <td data-l="Apartment"><b>{r.apt}</b>{r.sub ? <div className="cell-sub">{r.sub}</div> : null}</td>
          <td data-l="Customer"><b>{r.name}</b><div className="cell-sub num">{r.cid}</div></td>
          <td data-l="Last reading" className="r num">{r.billed ? <>{r.billed.cur != null && r.billed.units != null ? r.billed.cur - r.billed.units : '—'}</>
            : r.prev != null ? <>{r.prev}<div className="cell-sub">{r.prevFrom}</div></>
            : <input name={`prev:${r.oid}`} type="text" inputMode="numeric" className="mtr-in" placeholder="previous" value={v.prev || ''} onChange={e => set(r.oid, 'prev', e.target.value)} aria-label={`${r.apt}: previous reading`} />}</td>
          <td data-l="Reading now" className="r">{r.billed ? <span className="num">{r.billed.cur ?? '—'}</span>
            : <input name={`cur:${r.oid}`} type="text" inputMode="numeric" className="mtr-in" placeholder="reading" value={v.cur || ''} onChange={e => set(r.oid, 'cur', e.target.value)} aria-label={`${r.apt}: reading now`} />}</td>
          <td data-l="Units · amount" className="r num">{r.billed ? <><b>{r.billed.net}</b><div className="cell-sub">{r.billed.units ?? 0} units · {r.billed.locked ? 'paid · history' : 'billed · unpaid'}</div></>
            : !c ? <span className="cell-sub">—</span> : 'bad' in c ? <span className="bld-err">{c.bad}</span>
            : <><b>{rs(c.amount!)}</b><div className="cell-sub">{c.units} units × {rs(rate)}</div>{c.warn ? <div className="tag warn">{c.warn}</div> : null}</>}</td>
          <td className="r" style={{ whiteSpace: 'nowrap' }}>{r.billed ? (r.billed.locked ? <span className="cell-sub">Locked</span> : <Go href={r.billed.editHref} className="btn sm"><Ic n="edit" s={14} /> Edit</Go>)
            : <Go href={r.photoHref} className="btn sm ghost" title="Enter this reading with a photo of the meter"><Ic n="camera" s={14} /> With photo</Go>}</td>
        </tr>; })}
    </tbody></table></div>
    <div className="meter-bar"><span className="cell-sub">{ready.length ? <><b>{ready.length}</b> reading{ready.length === 1 ? '' : 's'} ready · {rs(total)} to bill for {periodLabel}</> : 'Type the readings; units and amounts appear as you go.'}{bad ? ` · ${bad} to check` : ''}</span>
      <Submit className="btn primary" pendingText="Making the bills…">{`Save readings and bill (${ready.length})`}</Submit></div>
  </form>;
}
