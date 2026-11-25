// Delete employee / bring back (24 Nov 2026), on Staff & connections.
import { deleteStaffAction, restoreStaffAction } from '@/lib/actions-leave';
import { LEAVE_REASONS } from '@/lib/people';
import { Submit, CloseBtn } from '@/components/client';

/** Pick the person, their last working day and why they left. They move to Past employees and can't sign in. */
export function DeleteEmployeeForm({ options, picked, today }: { options: { id: string; label: string }[]; picked?: string; today: string }) {
  return <form action={deleteStaffAction} className="rules-form del-form">
    <div className="form-row"><label htmlFor="del-id">Employee <span className="req">*</span></label>
      <select id="del-id" name="id" defaultValue={picked || ''} required><option value="" disabled>Choose who is leaving…</option>{options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
    <div className="grid2" style={{ gap: 10 }}>
      <div className="form-row"><label htmlFor="del-d">Last working day <span className="req">*</span></label><input id="del-d" name="leftOn" type="date" defaultValue={today} max={today} required /></div>
      <div className="form-row"><label htmlFor="del-r">Why they left <span className="req">*</span></label><select id="del-r" name="reason" defaultValue="" required><option value="" disabled>Choose…</option>{LEAVE_REASONS.map(r => <option key={r}>{r}</option>)}</select></div>
    </div>
    <div className="form-row"><label htmlFor="del-n">Note</label><input id="del-n" name="note" maxLength={200} placeholder="Optional, e.g. final settlement pending" /></div>
    <div className="callout warn"><div><b>What happens:</b> they move to <b>Past employees</b>. Their login is turned off and signed out everywhere, so they can&apos;t sign in again. Everything they did and entered stays in the records. You can bring them back if they rejoin.</div></div>
    <label className="cb"><input type="checkbox" name="confirm" required /> I understand: they can no longer sign in</label>
    <div className="m-actions"><CloseBtn keys={['m', 'id']} /><Submit className="btn danger" pendingText="Deleting…">Delete employee</Submit></div>
  </form>;
}
export function RestoreForm({ id, name }: { id: string; name: string }) {
  return <form action={restoreStaffAction} className="del-restore"><input type="hidden" name="id" value={id} />
    <Submit className="btn sm" pendingText="…">Bring {name.split(' ')[0]} back</Submit><span className="cell-sub">If they rejoin: they can sign in again with their old email and password.</span></form>;
}
