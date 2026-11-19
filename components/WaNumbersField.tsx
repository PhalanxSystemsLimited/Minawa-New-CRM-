'use client';
// Staff form: the WhatsApp numbers this person sends from (20 Nov 2026). Each has a label (Personal or Company), its own
// daily limit (different customers in any 24 hours; default 125) and an on/off switch. Sent to the server as one JSON
// field (waNumbers) and checked there (lib/wa-numbers.ts parseNumbers).
import { useState } from 'react';

type Row = { id: string; number: string; label: 'Personal' | 'Company'; limit: string; active: boolean };
const DEFAULT = 125, MAX = 4;

export function WaNumbersField({ prefix, initial }: { prefix: string; initial: { id: string; number: string; label: string; limit: number; active: boolean }[] }) {
  const [rows, setRows] = useState<Row[]>(() => initial.map(n => ({ id: n.id, number: n.number ? '+' + n.number : '', label: n.label === 'Company' ? 'Company' : 'Personal', limit: String(n.limit), active: n.active })));
  const set = (i: number, k: keyof Row, v: string | boolean) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const add = () => setRows(r => r.length >= MAX ? r : [...r, { id: '', number: '', label: r.some(x => x.label === 'Company') ? 'Personal' : 'Company', limit: String(DEFAULT), active: true }]);
  const json = JSON.stringify(rows.filter(r => r.number.trim()).map(r => ({ id: r.id, number: r.number, label: r.label, limit: Number(r.limit), active: r.active })));
  return <fieldset className="wa-nums">
    <legend>WhatsApp numbers they send from</legend>
    <input type="hidden" name="waNumbers" value={json} />
    {rows.length ? <div className="wa-nums-list">{rows.map((r, i) => <div className={'wa-num' + (r.active ? '' : ' off')} key={i}>
      <div className="form-row"><label htmlFor={`${prefix}-wn-${i}`}>Number</label>
        <input id={`${prefix}-wn-${i}`} type="tel" inputMode="tel" placeholder="+92 300 1234567" value={r.number} onChange={e => set(i, 'number', e.target.value)} required /></div>
      <div className="form-row"><label htmlFor={`${prefix}-wl-${i}`}>Whose</label>
        <select id={`${prefix}-wl-${i}`} value={r.label} onChange={e => set(i, 'label', e.target.value)}><option>Company</option><option>Personal</option></select></div>
      <div className="form-row"><label htmlFor={`${prefix}-wd-${i}`}>Daily limit</label>
        <input id={`${prefix}-wd-${i}`} type="number" min={1} max={1000} step={1} value={r.limit} onChange={e => set(i, 'limit', e.target.value)} required /></div>
      <label className="cb wa-num-on"><input type="checkbox" checked={r.active} onChange={e => set(i, 'active', e.target.checked)} /> In use</label>
      <button type="button" className="icon wa-num-x" aria-label={`Remove ${r.number || 'this number'}`} onClick={() => setRows(x => x.filter((_, j) => j !== i))}>×</button>
    </div>)}</div> : <p className="cell-sub" style={{ margin: 0 }}>No number yet: this person can&apos;t open WhatsApp chats from the CRM until one is added.</p>}
    {rows.length < MAX ? <button type="button" className="btn sm" onClick={add}>+ Add a number</button> : null}
    <p className="cell-sub" style={{ margin: 0 }}>The daily limit counts different customers messaged in any 24 hours from that number (a customer messaged again within the 24 hours is free). 125 is half of the 250 a day Meta publishes for new business numbers; for a brand-new number, start lower (for example 60) for the first two weeks. A number shared by two people has one count.</p>
  </fieldset>;
}
