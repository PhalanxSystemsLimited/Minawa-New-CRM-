'use client';
// "Select all" for a list of ticked rows inside one form (18 Nov 2026): the header box ticks or clears every
// `input[name=<name>]` in the form, and the bar shows how many are ticked and their total (each box's data-amt),
// so the Accountant can match it to the cash in hand or the bank statement before approving.
import { useEffect, useRef, useState } from 'react';

export function BulkSelect({ name = 'e', label = 'Select all' }: { name?: string; label?: string }) {
  const box = useRef<HTMLInputElement>(null), [n, setN] = useState(0), [amt, setAmt] = useState(0), [all, setAll] = useState(0);
  useEffect(() => {
    const form = box.current?.closest('form'); if (!form) return;
    const list = () => Array.from(form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`));
    const sync = () => { const l = list(), on = l.filter(x => x.checked); setAll(l.length); setN(on.length); setAmt(on.reduce((a, x) => a + (+(x.dataset.amt || 0)), 0));
      if (box.current) { box.current.checked = l.length > 0 && on.length === l.length; box.current.indeterminate = on.length > 0 && on.length < l.length; }
      form.querySelectorAll<HTMLElement>('[data-bulk-row]').forEach(r => r.classList.toggle('on', !!r.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`))); };
    form.addEventListener('change', sync); sync();
    return () => form.removeEventListener('change', sync);
  }, [name]);
  const toggle = (on: boolean) => { const form = box.current?.closest('form'); form?.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`).forEach(x => { x.checked = on; }); form?.dispatchEvent(new Event('change', { bubbles: true })); };
  return <label className="bulk-all"><input ref={box} type="checkbox" onChange={e => toggle(e.target.checked)} aria-label={label} /> <span>{label}</span>
    <span className="bulk-sum">{n ? <><b>{n}</b> of {all} ticked · <b className="num">Rs {amt.toLocaleString('en-US')}</b></> : `${all} waiting`}</span></label>;
}
