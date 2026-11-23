// Attendance views shared by the screens (23 Nov 2026): the status tag, the employee form, the day-marking form.
import type { Employee, Staff, Project, AttRecord } from '@/lib/types';
import { DESIGNATIONS, DAYS, STATUS_LABEL, distText, when, type DayView } from '@/lib/attendance';
import { saveEmployeeAction, markDayAction } from '@/lib/actions-att';
import { Submit, CloseBtn } from '@/components/client';

export const statusTag = (v: DayView) => v.label ? <span className={`tag ${v.tone === 'muted' ? '' : v.tone}`}>{v.label}</span> : <span className="cell-sub">—</span>;
export const howText = (r: AttRecord | null | undefined) => !r ? '' : r.how === 'manager' ? `marked by ${r.byName || 'the manager'}` : r.inPlace ? `${distText(r.inPlace.dist)} from the office · ±${r.inPlace.acc} m` : r.how === 'app' ? 'app' : 'fingerprint';
export const inOut = (r: AttRecord | null | undefined) => r?.inAt ? `${when(r.inAt)}${r.outAt ? ` – ${when(r.outAt)}` : ' – still in'}` : '';
export { LETTER } from '@/lib/attendance';

export function EmployeeForm({ e, staff, projects, emps, back }: { e?: Employee | null; staff: Staff[]; projects: Project[]; emps: Employee[]; back: string }) {
  const logins = staff.filter(s => s.active && s.role !== 'admin' && (!emps.some(x => x.staffId === s.id) || s.id === e?.staffId));
  const id = (k: string) => `emp-${k}`;
  return <form action={saveEmployeeAction} className="emp-form">
    {e ? <input type="hidden" name="id" value={e.id} /> : null}<input type="hidden" name="back" value={back} />
    <div className="grid2" style={{ gap: 10 }}>
      <div className="form-row"><label htmlFor={id('login')}>Their CRM login <small>(building managers and accountants only)</small></label>
        <select id={id('login')} name="staffId" defaultValue={e?.staffId || ''}><option value="">None: field staff (gardener, cleaner, guard…)</option>{logins.map(s => <option key={s.id} value={s.id}>{s.name} · {s.role === 'manager' ? 'Building manager' : 'Accountant'}</option>)}</select>
        <div className="cell-sub">Linked: their name and phone come from the login if left empty, and alerts about them go to the Accountant and the Admin.</div></div>
      <div className="form-row"><label htmlFor={id('des')}>Designation <span className="req">*</span></label>
        <input id={id('des')} name="designation" list="emp-designations" defaultValue={e?.designation || ''} placeholder="Gardener, Cleaner, Guard…" />
        <datalist id="emp-designations">{DESIGNATIONS.map(d => <option key={d} value={d} />)}</datalist></div>
      <div className="form-row"><label htmlFor={id('name')}>Full name <span className="req">*</span></label><input id={id('name')} name="name" defaultValue={e?.name || ''} placeholder="As on the CNIC" /></div>
      <div className="form-row"><label htmlFor={id('fn')}>Father&apos;s name</label><input id={id('fn')} name="fatherName" defaultValue={e?.fatherName || ''} /></div>
      <div className="form-row"><label htmlFor={id('ph')}>Mobile number <span className="req">*</span></label><input id={id('ph')} name="phone" inputMode="tel" defaultValue={e?.phone || ''} placeholder="03xx xxxxxxx" /></div>
      <div className="form-row"><label htmlFor={id('cn')}>CNIC</label><input id={id('cn')} name="cnic" inputMode="numeric" defaultValue={e?.cnic || ''} placeholder="12345-1234567-1" /></div>
    </div>
    <fieldset className="emp-bld"><legend>Buildings they work at <span className="req">*</span> <small>they can check in at any of these</small></legend>
      {projects.map(p => <label key={p.id} className="cb"><input type="checkbox" name="projects" value={p.id} defaultChecked={!!e?.projects.includes(p.id)} /> {p.name}</label>)}</fieldset>
    <div className="grid2" style={{ gap: 10 }}>
      <div className="form-row"><label htmlFor={id('ss')}>Working hours: start <span className="req">*</span></label><input id={id('ss')} name="shiftStart" type="time" defaultValue={e?.shiftStart || '09:00'} /></div>
      <div className="form-row"><label htmlFor={id('se')}>Working hours: end <span className="req">*</span></label><input id={id('se')} name="shiftEnd" type="time" defaultValue={e?.shiftEnd || '17:00'} /><div className="cell-sub">An end earlier than the start is a night shift (ends the next day).</div></div>
    </div>
    <fieldset className="emp-off"><legend>Weekly off days</legend>{DAYS.map((d, i) => <label key={d} className="cb"><input type="checkbox" name="offDays" value={i} defaultChecked={e ? e.offDays.includes(i) : i === 0} /> {d.slice(0, 3)}</label>)}</fieldset>
    <div className="form-row" style={{ maxWidth: 240 }}><label htmlFor={id('jd')}>Joined on</label><input id={id('jd')} name="joined" type="date" defaultValue={e?.joined || ''} /><div className="cell-sub">Days before this (or before the day they were added) aren&apos;t counted as absent.</div></div>
    <div className="m-actions">{e ? <CloseBtn /> : null}<Submit pendingText="Saving…">{e ? 'Save changes' : 'Add employee'}</Submit></div>
  </form>;
}

export function MarkDayForm({ e, d, rec, back }: { e: Employee; d: string; rec: AttRecord | null; back: string }) {
  return <form action={markDayAction} className="att-markf">
    <input type="hidden" name="id" value={e.id} /><input type="hidden" name="back" value={back} />
    <div className="att-markf-r">
      <div className="form-row"><label htmlFor="mk-d">Day</label><input id="mk-d" name="d" type="date" defaultValue={d} max={d} /></div>
      <div className="form-row"><label htmlFor="mk-s">Mark as</label><select id="mk-s" name="status" defaultValue={rec?.status || 'present'}>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="form-row"><label htmlFor="mk-i">In</label><input id="mk-i" name="in" type="time" defaultValue={rec?.inAt?.slice(11) || ''} /></div>
      <div className="form-row"><label htmlFor="mk-o">Out</label><input id="mk-o" name="out" type="time" defaultValue={rec?.outAt?.slice(11) || ''} /></div>
    </div>
    <div className="form-row"><label htmlFor="mk-n">Note</label><input id="mk-n" name="note" maxLength={200} placeholder="e.g. no phone, sick leave, checked in at the gate" /></div>
    <div className="m-actions"><Submit pendingText="Saving…">Save</Submit></div>
  </form>;
}
