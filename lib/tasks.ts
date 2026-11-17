// The three To do lists (Nov 2026). Each task belongs to one role:
//  · Building manager: WhatsApp to send (bills, reminders, notices, receipts, links), messages that didn't arrive,
//    promises to pay that were broken — for the buildings assigned to them.
//  · Accountant: money to check — bank-transfer screenshots owners sent (and, from step 3, cash recorded by managers).
//  · Admin: does none of these; sees both lists to monitor who is responsible and what is late.
// Tasks are worked out from the project's data every time (nothing extra is stored), so every screen agrees.
import type { State, Staff } from './types';
import { use, ownerById, failedList, instalmentStatus } from './engine';
import { toDoGroups } from './manual-send';
import { addDays, rs } from './fmt';

export type TaskRole = 'manager' | 'accountant';
export interface Task {
  id: string; role: TaskRole; project: string; pname: string;
  what: string; detail: string; apt?: string; owner?: string;
  since: string; deadline: string; overdue: boolean; href: string;
}

/** Every open task in one project. Call outside the engine: it enters the project's state itself. */
export function projectTasks(s: State): Task[] {
  return use(s, () => {
    const P = `/p/${s.project}`, out: Task[] = [], late = (d: string) => s.today > d;
    for (const g of toDoGroups()) {
      const deadline = g.since;   // made at 11:00 AM: meant to go out the same day
      out.push({ id: `send:${s.project}:${g.key}`, role: 'manager', project: s.project, pname: s.proj.name, what: `Send on WhatsApp: ${g.label.toLowerCase()}`,
        detail: `${g.n} owner${g.n === 1 ? '' : 's'} waiting`, since: g.since, deadline, overdue: late(deadline), href: `${P}/send?type=queue&kind=${g.key}&go=1` });
    }
    for (const m of failedList()) {
      const o = ownerById(m.ownerId), deadline = addDays(m.d, 2);
      out.push({ id: `fix:${m.id}`, role: 'manager', project: s.project, pname: s.proj.name, what: o.noPhone ? 'Add a WhatsApp number' : 'Fix the WhatsApp number',
        detail: m.title, apt: o.apt, owner: o.name, since: m.d, deadline, overdue: late(deadline), href: `${P}/apartments/${o.id}?m=fix&from=todo` });
    }
    for (const a of s.alerts.filter(x => !x.done)) {
      const o = ownerById(a.ownerId), deadline = addDays(a.d, 2);
      out.push({ id: `alert:${a.id}`, role: 'manager', project: s.project, pname: s.proj.name, what: 'Follow up a broken promise to pay',
        detail: a.text, apt: o.apt, owner: o.name, since: a.d, deadline, overdue: late(deadline), href: `${P}/apartments/${o.id}` });
    }
    for (const o of s.owners) {
      if (o.status !== 'active' || !o.instalments) continue;
      const st = instalmentStatus(o), late1 = st?.items.find(x => x.state === 'overdue');
      if (!st || !late1) continue;
      out.push({ id: `inst:${o.id}:${late1.n}`, role: 'manager', project: s.project, pname: s.proj.name, what: 'Follow up a late instalment',
        detail: `Instalment ${late1.n} of ${st.items.length}: ${rs(late1.left)} was due ${late1.due}`, apt: o.apt, owner: o.name, since: late1.due, deadline: addDays(late1.due, 3), overdue: late(addDays(late1.due, 3)), href: `${P}/apartments/${o.id}` });
    }
    for (const pr of s.proofs.filter(x => x.status === 'pending')) {
      const o = ownerById(pr.ownerId), deadline = addDays(pr.d, 1), cash = pr.kind === 'cash';
      out.push({ id: `proof:${pr.id}`, role: 'accountant', project: s.project, pname: s.proj.name, what: cash ? 'Confirm cash from a building manager' : 'Check a bank transfer',
        detail: cash ? `${rs(pr.amount)} · recorded by ${pr.byName || 'a building manager'}${pr.ref ? ` · receipt ${pr.ref}` : ''}` : `${rs(pr.amount)} · screenshot sent by the owner`,
        apt: o.apt, owner: o.name, since: pr.d, deadline, overdue: late(deadline), href: `/tasks#proof-${pr.id}` });
    }
    return out;
  });
}

/** Whose work a role's tasks are, for "Responsible" columns: the building's managers, or the accountants. */
export function responsible(t: Task, staff: Staff[]) {
  const names = t.role === 'manager'
    ? staff.filter(x => x.active && x.role === 'manager' && (x.projects || []).includes(t.project)).map(x => x.name)
    : staff.filter(x => x.active && x.role === 'accountant').map(x => x.name);
  return names.length ? names.join(', ') : t.role === 'manager' ? 'No building manager yet' : 'No accountant yet';
}

/** The tasks that are this person's own work. */
export const myTasks = (all: Task[], me: Staff) => me.role === 'manager' ? all.filter(t => t.role === 'manager')
  : me.role === 'accountant' ? all.filter(t => t.role === 'accountant') : [];

/** Building managers assigned to a project (names). */
export const managersOf = (pid: string, staff: Staff[]) => staff.filter(x => x.active && x.role === 'manager' && (x.projects || []).includes(pid)).map(x => x.name);
