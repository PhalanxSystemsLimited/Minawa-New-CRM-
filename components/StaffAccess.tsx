'use client';
// The staff form's role and buildings (20 Nov 2026). A Building manager and an Accountant must have at least one
// building ticked: the form won't send without one ("Please select at least one building for this role…"), and the
// server checks it too. An Admin always sees every building, so the list is greyed out while Admin is chosen (greyed
// boxes aren't sent, so an Admin is never saved with buildings).
import { useEffect, useRef, useState } from 'react';

export function StaffAccess({ prefix, role: role0, projects, picked, saving, accountants = [], reportsTo = [] }: { prefix: string; role: string; projects: { id: string; name: string }[]; picked: string[]; saving: 'create' | 'save';
  /** 25–26 Nov 2026: a building manager reports to one or more accountants. */
  accountants?: { id: string; name: string }[]; reportsTo?: string[] }) {
  const [role, setRole] = useState(role0 === 'admin' || role0 === 'manager' ? role0 : 'accountant');
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(picked));
  const [tried, setTried] = useState(false);
  const box = useRef<HTMLFieldSetElement>(null);
  const admin = role === 'admin', missing = !admin && ticked.size === 0;
  const msg = `Please select at least one building for this role before ${saving === 'create' ? 'creating the account' : 'saving'}.`;
  // The browser's own check: the first box carries the message while nothing is ticked, so the form can't be sent.
  useEffect(() => {
    const first = box.current?.querySelector<HTMLInputElement>('input[type=checkbox]');
    if (first) first.setCustomValidity(missing ? msg : '');
  }, [missing, msg]);
  // When the browser stops the form for this, show the message under the list as well.
  useEffect(() => {
    const first = box.current?.querySelector<HTMLInputElement>('input[type=checkbox]');
    if (!first) return;
    const bad = () => setTried(true);
    first.addEventListener('invalid', bad);
    return () => first.removeEventListener('invalid', bad);
  }, []);
  // 26 Nov 2026: building managers send no WhatsApp messages, so the form's WhatsApp numbers are hidden (and not sent)
  // while Building manager is chosen.
  useEffect(() => {
    const wa = box.current?.closest('form')?.querySelector<HTMLFieldSetElement>('fieldset.wa-nums');
    if (wa) { wa.disabled = role === 'manager'; wa.hidden = role === 'manager'; }
  }, [role]);
  const flip = (id: string, on: boolean) => setTicked(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  return <>
    <div className="form-row"><label htmlFor={`${prefix}-r`}>Role</label>
      <select id={`${prefix}-r`} name="role" value={role} onChange={e => setRole(e.target.value)}>
        <option value="accountant">Accountant</option><option value="manager">Building manager</option><option value="admin">Admin (owner, directors)</option>
      </select></div>
    {role === 'manager' ? <fieldset className="bld-pick acc-pick" id={`${prefix}-rt`}>
      <legend>Reports to (one or more accountants)</legend>
      {accountants.length ? accountants.map(a => <label key={a.id} className="cb"><input type="checkbox" name="accountants" value={a.id} defaultChecked={reportsTo.includes(a.id)} /> {a.name}</label>)
        : <p className="cell-sub" style={{ margin: 0 }}>No accountants yet. Add one first, then tick them here.</p>}
      <p className="cell-sub" style={{ margin: '4px 0 0' }}>Each accountant ticked sees this manager&apos;s buildings, sends him payment requests, approves the payments he enters and sends the bills, reminders, notices and receipts there. A building manager sends no WhatsApp messages, so he needs no WhatsApp number.</p>
    </fieldset> : null}
    <fieldset ref={box} className={'bld-pick' + (admin ? ' off' : '') + (tried && missing ? ' bad' : '')} disabled={admin} aria-describedby={`${prefix}-bh`}>
      <legend>Buildings {admin ? '(not needed for an Admin)' : <>(at least one) <span className="req">required</span></>}</legend>
      {projects.map(p => <label key={p.id} className="cb"><input type="checkbox" name="projects" value={p.id} checked={ticked.has(p.id)} onChange={e => flip(p.id, e.target.checked)} /> {p.name}</label>)}
      <p id={`${prefix}-bh`} className={tried && missing ? 'bld-err' : 'cell-sub'} style={{ margin: '4px 0 0' }} role={tried && missing ? 'alert' : undefined}>
        {admin ? 'Admins always see every building, so there is nothing to tick.'
          : tried && missing ? msg
          : role === 'manager' ? 'A building manager only sees the buildings ticked here.' : 'An accountant sees the buildings ticked here, plus the buildings of the building managers who report to him.'}
      </p>
    </fieldset>
  </>;
}
