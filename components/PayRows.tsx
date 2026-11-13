'use client';
// Payments list: one row per payment; click a row (or the arrow) to see everything about it. Opening the page also
// marks the payments as seen, which clears the "new" badge on the Payments tab for this person.
import { Fragment, useEffect, useState } from 'react';

export interface PayRow { key: string; isNew: boolean; cells: React.ReactNode[]; detail: React.ReactNode }

export function PayRows({ rows, cols }: { rows: PayRow[]; cols: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const flip = (k: string) => setOpen(o => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return <tbody>{rows.map(r => <Fragment key={r.key}>
    <tr className={`pay-row${r.isNew ? ' pay-new' : ''}${open.has(r.key) ? ' open' : ''}`} onClick={e => { if ((e.target as HTMLElement).closest('a,button:not(.pay-x)')) return; flip(r.key); }}>
      <td className="pay-x-cell"><button type="button" className="pay-x" aria-expanded={open.has(r.key)} aria-label={open.has(r.key) ? 'Hide details' : 'Show details'}>{open.has(r.key) ? '▾' : '▸'}</button></td>
      {r.cells.map((c, i) => <td key={i} className={i === 2 ? 'r num' : undefined}>{c}</td>)}
    </tr>
    {open.has(r.key) ? <tr className="pay-detail"><td></td><td colSpan={cols}>{r.detail}</td></tr> : null}
  </Fragment>)}</tbody>;
}

/** Remembers (in a cookie for this person and project) the newest payment they have seen. */
export function MarkPaymentsSeen({ cookie, latest, seen }: { cookie: string; latest: string | null; seen: string | null }) {
  useEffect(() => {
    if (!latest || (seen && seen >= latest)) return;
    // Seen: the badge on the Payments tab is gone from the next screen on (it isn't shown on Payments itself).
    document.cookie = `${cookie}=${latest}; path=/; max-age=${400 * 86400}; samesite=lax`;
  }, [cookie, latest, seen]);
  return null;
}
