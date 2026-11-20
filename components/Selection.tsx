'use client';
// Picking rows to download (21 Nov 2026): a tick box on each row (it doesn't open the row), a tick box that picks
// every row shown, and the download bar: "Download all shown" or "Download selected (n)" as an Excel file.
import { useEffect, useState } from 'react';
import { Ic } from './icons';

/** The tick box on a row. */
export function RowCheck({ form, value, label }: { form: string; value: string; label: string }) {
  return <input type="checkbox" className="row-check" form={form} name="sel" value={value} aria-label={label}
    onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} />;
}
/** The tick box in the header: every row shown. */
export function AllCheck({ form }: { form: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => { const l = [...document.querySelectorAll<HTMLInputElement>(`input.row-check[form="${form}"]`)]; setOn(!!l.length && l.every(x => x.checked)); };
    document.addEventListener('change', f); return () => document.removeEventListener('change', f);
  }, [form]);
  return <input type="checkbox" aria-label="Select every row shown" checked={on} onChange={e => {
    document.querySelectorAll<HTMLInputElement>(`input.row-check[form="${form}"]`).forEach(x => { x.checked = e.target.checked; });
    document.dispatchEvent(new Event('change')); setOn(e.target.checked);
  }} />;
}
/** The download bar: a form (GET) to the export with the screen's filters, plus the ticked rows. */
export function SelBar({ id, action, params, allHref, noun, allLabel = 'Download all shown' }: { id: string; action: string; params: Record<string, string>; allHref: string; noun: string; allLabel?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const f = () => setN(document.querySelectorAll(`input.row-check[form="${id}"]:checked`).length);
    f(); document.addEventListener('change', f); return () => document.removeEventListener('change', f);
  }, [id]);
  const clear = () => { document.querySelectorAll<HTMLInputElement>(`input.row-check[form="${id}"]`).forEach(x => { x.checked = false; }); document.dispatchEvent(new Event('change')); };
  return <form id={id} action={action} method="get" className="sel-bar no-print">
    {Object.entries(params).filter(([, v]) => v).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    <span className="cell-sub">{n ? `${n} ${noun}${n === 1 ? '' : 's'} selected` : `Tick ${noun}s to download only those`}</span>
    {n ? <button type="button" className="btn sm ghost" onClick={clear}>Clear</button> : null}
    <button type="submit" className="btn sm" disabled={!n}><Ic n="download" s={15} /> Download selected{n ? ` (${n})` : ''}</button>
    <a className="btn sm" href={allHref}><Ic n="download" s={15} /> {allLabel}</a>
  </form>;
}
