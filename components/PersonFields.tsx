'use client';
// A person's details (21 Nov 2026), for a customer's possession and an employee: their ID (shown, not editable),
// full name, CNIC number, CNIC expiry, address on the CNIC and phone. An expired CNIC, or one expiring within a month,
// shows a warning for information only: it never stops the form.
import { useState } from 'react';

const fmtCnic = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 13); return d.length > 12 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
const fd = (s: string) => { const [y, m, d] = s.split('-'); return `${+d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]} ${y}`; };

/** The read-only ID box. */
export function IdBox({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="form-row id-box"><label>{label}</label><input type="text" value={value} readOnly tabIndex={-1} aria-readonly="true" />{note ? <div className="cell-sub">{note}</div> : null}</div>;
}

/** The warning under a CNIC expiry date (nothing when it is more than a month away). */
export function CnicWarn({ expiry, today }: { expiry: string; today: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const n = days(expiry, today);
  if (n < 0) return <div className="cnic-warn bad" role="status"><b>This CNIC has expired</b> ({fd(expiry)}, {-n} day{-n === 1 ? '' : 's'} ago). You can still save; ask for the renewed CNIC.</div>;
  if (n <= 30) return <div className="cnic-warn warn" role="status"><b>This CNIC expires {n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}</b> ({fd(expiry)}). For information only.</div>;
  return null;
}

export function PersonFields({ prefix, today, required = true, nameLabel = 'Full name (as on the CNIC)', phoneLabel = 'Phone number', phoneName = 'phone', values = {} }: {
  prefix: string; today: string; required?: boolean; nameLabel?: string; phoneLabel?: string; phoneName?: string;
  values?: { name?: string; cnic?: string | null; cnicExpiry?: string | null; cnicAddress?: string | null; phone?: string | null };
}) {
  const [cnic, setCnic] = useState(fmtCnic(values.cnic || '')), [exp, setExp] = useState(values.cnicExpiry || '');
  const req = required ? <span className="req"> required</span> : null;
  return <div className="person-f">
    <div className="form-row"><label htmlFor={`${prefix}-n`}>{nameLabel}{req}</label><input id={`${prefix}-n`} name="name" type="text" required defaultValue={values.name || ''} autoComplete="off" /></div>
    <div className="grid2" style={{ gap: 10 }}>
      <div className="form-row"><label htmlFor={`${prefix}-c`}>CNIC number{req}</label>
        <input id={`${prefix}-c`} name="cnic" type="text" inputMode="numeric" autoComplete="off" required={required} placeholder="12345-1234567-1" value={cnic}
          pattern="\d{5}-\d{7}-\d" title="13 digits: 12345-1234567-1" onChange={e => setCnic(fmtCnic(e.target.value))} /></div>
      <div className="form-row"><label htmlFor={`${prefix}-x`}>CNIC expiry date{req}</label>
        <input id={`${prefix}-x`} name="cnicExpiry" type="date" required={required} value={exp} onChange={e => setExp(e.target.value)} /></div>
    </div>
    <CnicWarn expiry={exp} today={today} />
    <div className="form-row"><label htmlFor={`${prefix}-ad`}>Address on the CNIC{req}</label><textarea id={`${prefix}-ad`} name="cnicAddress" rows={2} required={required} defaultValue={values.cnicAddress || ''} placeholder="House, street, area, city" /></div>
    <div className="form-row"><label htmlFor={`${prefix}-p`}>{phoneLabel}{req}</label><input id={`${prefix}-p`} name={phoneName} type="tel" required={required} defaultValue={values.phone || ''} placeholder="+92 3xx xxx xxxx" /></div>
  </div>;
}
