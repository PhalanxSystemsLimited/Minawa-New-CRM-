// Live notifications (Nov 2026): what each person should hear about straight away, worked out from the data (nothing
// extra is stored). Open screens ask /api/live every few seconds; when the data's revision changes the server sends
// this list again, and the browser pops up the items it hasn't shown before (components/LivePayments.tsx).
//  · Admin: new approval requests.
//  · Accountant: payments a building manager entered (to confirm) and owners' bank screenshots (to check); their own
//    requests once the Admin decides them.
//  · Building manager: new work in To do (bills, reminders, notices to send; numbers to fix; broken promises), their
//    entered payments once the Accountant confirms or rejects them, and their requests once the Admin decides them.
//  · Everyone: payments received in their buildings.
import type { Staff, State } from './types';
import { use, ownerById } from './engine';
import { KIND_LABEL } from './approvals';
import { projectTasks, myTasks } from './tasks';
import { addDays, rs } from './fmt';

export interface Note { id: string; at: string; tone: 'info' | 'good' | 'warn' | 'bad'; title: string; text: string; href: string }

const RECENT = 3;   // days: decisions and payments older than this are not news any more

export function notesFor(staff: Staff, states: State[]): Note[] {
  const out: Note[] = [];
  for (const s of states) use(s, () => {
    const since = addDays(s.today, -RECENT), P = `/p/${s.project}`, apt = (id: string | null) => (id && ownerById(id)?.apt) || '';
    // Requests and decisions.
    for (const a of s.approvals) {
      const what = KIND_LABEL[a.kind] || 'Change', where = a.ownerId ? `${apt(a.ownerId)} · ${s.proj.name}` : s.proj.name;
      if (staff.role === 'admin' && a.status === 'pending')
        out.push({ id: `apv:${s.project}:${a.id}`, at: `${a.d} ${a.t}`, tone: 'warn', title: `Approval request · ${what}`, text: `${a.byName} (${where}): ${a.summary}`, href: '/approvals' });
      if (staff.role !== 'admin' && a.byId === staff.id && a.status !== 'pending' && a.status !== 'withdrawn' && (a.decidedD || '') >= since) {
        const verb = a.status === 'approved' ? 'Approved' : a.status === 'rejected' ? 'Rejected' : 'Changes asked';
        out.push({ id: `dec:${s.project}:${a.id}:${a.status}`, at: `${a.decidedD} ${a.decidedT || ''}`, tone: a.status === 'approved' ? 'good' : a.status === 'rejected' ? 'bad' : 'warn',
          title: `${verb} · ${what}`, text: `${where}: ${a.summary}${a.reply ? ` · "${a.reply}"` : ''}`, href: '/approvals?s=done' });
      }
    }
    // Money waiting for the Accountant, and the answers a building manager gets.
    for (const p of s.proofs) {
      if (staff.role === 'accountant' && p.status === 'pending')
        out.push({ id: `proof:${s.project}:${p.id}`, at: `${p.d} ${p.t}`, tone: 'info', title: p.kind === 'cash' ? 'Payment to confirm' : 'Bank screenshot to check',
          text: `${apt(p.ownerId)} · ${s.proj.name} · ${rs(p.amount)}${p.kind === 'cash' ? ` ${(p.method || 'cash').toLowerCase()} entered by ${p.byName || 'a building manager'}` : ''}`, href: `/tasks#proof-${p.id}` });
      if (staff.role === 'manager' && p.kind === 'cash' && p.byId === staff.id && p.status !== 'pending' && (p.doneOn || '') >= since)
        out.push({ id: `proofd:${s.project}:${p.id}:${p.status}`, at: `${p.doneOn} 23:59`, tone: p.status === 'verified' ? 'good' : 'bad',
          title: p.status === 'verified' ? 'Payment confirmed' : 'Payment not confirmed', text: `${apt(p.ownerId)} · ${rs(p.amount)}${p.status === 'verified' ? ` confirmed by ${p.checkedBy || 'the Accountant'}` : p.reply ? `: ${p.reply}` : ''}`, href: `${P}/apartments/${p.ownerId}` });
    }
    // Payments received.
    for (const p of s.payments) if (p.d >= since)
      out.push({ id: `pay:${s.project}:${p.id}`, at: `${p.d} ${p.t}`, tone: 'good', title: 'Payment received', text: `${apt(p.ownerId)} · ${s.proj.name} · ${rs(p.amount)} · ${p.method}`, href: `${P}/payments` });
  });
  // A building manager's To do: a task is news when it is new, or when more owners are waiting in it.
  if (staff.role === 'manager') for (const t of myTasks(states.flatMap(s => projectTasks(s)), staff))
    out.push({ id: `task:${t.id}:${t.detail}`, at: `${t.since} 11:00`, tone: t.overdue ? 'bad' : 'info', title: `To do · ${t.what}`, text: `${t.pname}${t.apt ? ` · ${t.apt}` : ''} · ${t.detail}`, href: t.href });
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
}
