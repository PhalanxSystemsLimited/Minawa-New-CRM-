// The three To do lists (Nov 2026). Each task belongs to one role:
//  · Building manager: receipts to send (one task per payment, the most urgent: the customer has just paid; since 19 Nov
//    2026 made the moment a payment is entered), WhatsApp to send (bills, reminders, notices, links), messages that didn't
//    arrive, promises to pay that were broken, payments the Accountant didn't receive — for the buildings assigned to them.
//  · Accountant: money to check — bank-transfer screenshots owners sent (and, from step 3, cash recorded by managers).
//  · Admin: does none of these; sees both lists to monitor who is responsible and what is late.
// Tasks are worked out from the project's data every time (nothing extra is stored), so every screen agrees.
import type { State, Staff } from './types';
import { use, ownerById, failedList, instalmentStatus, awaitingApproval } from './engine';
import { toDoGroups, pendingGroups } from './manual-send';
import { addDays, rs } from './fmt';
import { voucherRows, DUES } from './vouchers';

export type TaskRole = 'manager' | 'accountant';
export interface Task {
  id: string; role: TaskRole; project: string; pname: string;
  what: string; detail: string; apt?: string; owner?: string;
  since: string; deadline: string; overdue: boolean; href: string;
  /** Only this person's (cash he took and still has to hand over), not every manager of the building. */
  forId?: string; forName?: string;
  /** 'receipt': send a customer their receipt (the Receipts screen; done before anything else). */
  kind?: 'receipt';
  /** When it was made (receipts: the time the payment was entered). */
  time?: string;
  /** Receipts: the building manager who entered the payment (he isn't notified about his own). */
  enteredById?: string | null;
}

/** Every open task in one project. Call outside the engine: it enters the project's state itself. */
export function projectTasks(s: State): Task[] {
  return use(s, () => {
    const P = `/p/${s.project}`, out: Task[] = [], late = (d: string) => s.today > d;
    // Receipts: one task per customer who just paid, to send straight away (late from the next day).
    for (const g of pendingGroups(m => m.kind === 'receipt')) {
      const m = g.msg, o = ownerById(m.ownerId), pay = s.payments.find(p => p.id === m.pdf?.id), entry = pay?.entryId ? s.proofs.find(x => x.id === pay.entryId) : null;
      if (!o) continue;
      out.push({ id: `rcpt:${m.id}`, role: 'manager', kind: 'receipt', project: s.project, pname: s.proj.name, what: 'Send the receipt',
        detail: pay ? `${rs(pay.amount)} · ${pay.receipt} · ${/bank/i.test(pay.method) ? 'bank transfer' : 'cash'}${pay.enteredBy ? ` · entered by ${pay.enteredBy}` : ''}` : m.title,
        apt: o.apt, owner: o.name, since: m.d, time: m.t, enteredById: entry?.byId || null, deadline: m.d, overdue: late(m.d), href: `${P}/send?type=queue&kind=receipt&ids=${o.id}&go=1` });
    }
    for (const g of toDoGroups()) {
      if (g.key === 'receipt') continue;
      const deadline = g.since;   // made at 11:00 AM: meant to go out the same day
      out.push({ id: `send:${s.project}:${g.key}`, role: 'manager', project: s.project, pname: s.proj.name, what: `Send on WhatsApp: ${g.label.toLowerCase()}`,
        detail: `${g.n} owner${g.n === 1 ? '' : 's'} waiting`, since: g.since, deadline, overdue: late(deadline), href: `${P}/send?type=queue&kind=${g.key}&go=1` });
    }
    // Customers without WhatsApp: their bills, warnings and receipts are printed and delivered by hand (one task).
    const vr = voucherRows().filter(r => r.items.length);
    if (vr.length) {
      const since = vr.flatMap(r => r.items.map(i => i.msg.d)).sort()[0], deadline = addDays(since, 2), n = vr.reduce((a, r) => a + r.items.length, 0);
      out.push({ id: `print:${s.project}`, role: 'manager', project: s.project, pname: s.proj.name, what: 'Deliver printed vouchers',
        detail: `${vr.length} customer${vr.length === 1 ? '' : 's'} without WhatsApp · ${n} paper${n === 1 ? '' : 's'} to print`, since, deadline, overdue: late(deadline), href: `${P}/send?mode=print` });
    }
    for (const m of failedList()) {
      const o = ownerById(m.ownerId), deadline = addDays(m.d, 2);
      if (o.noPhone && DUES.includes(m.kind)) continue;   // on the printed vouchers list instead
      out.push({ id: `fix:${m.id}`, role: 'manager', project: s.project, pname: s.proj.name, what: o.noPhone ? 'Add a WhatsApp number' : 'Fix the WhatsApp number',
        detail: m.title, apt: o.apt, owner: o.name, since: m.d, deadline, overdue: late(deadline), href: `${P}/apartments/${o.id}?m=fix&from=todo` });
    }
    for (const a of s.alerts.filter(x => !x.done)) {
      const o = ownerById(a.ownerId), entry = a.kind === 'entry', deadline = addDays(a.d, entry ? 1 : 2);
      out.push({ id: `alert:${a.id}`, role: 'manager', project: s.project, pname: s.proj.name, what: entry ? 'Put right a payment the Accountant didn\'t receive' : 'Follow up a broken promise to pay',
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
      out.push({ id: `proof:${pr.id}`, role: 'accountant', project: s.project, pname: s.proj.name, what: cash ? 'Confirm a cash payment from a building manager' : 'Check a bank transfer',
        detail: cash ? `${rs(pr.amount)} · recorded by ${pr.byName || 'a building manager'}${pr.ref ? ` · ref ${pr.ref}` : ''}` : `${rs(pr.amount)} · screenshot sent by the owner`,
        apt: o.apt, owner: o.name, since: pr.d, deadline, overdue: late(deadline), href: `/tasks#proof-${pr.id}` });
    }
    // Cash (17 Nov 2026): building manager → Accountant → bank.
    const held = new Map<string, { name: string; amt: number; n: number; oldest: string }>();
    for (const p of s.payments) if (p.collectorId && !p.handoverId && !p.reversed && !awaitingApproval(p)) {
      const h = held.get(p.collectorId) || { name: p.collectorName || 'Building manager', amt: 0, n: 0, oldest: p.d };
      h.amt += p.amount; h.n++; if (p.d < h.oldest) h.oldest = p.d; held.set(p.collectorId, h);
    }
    for (const [id, h] of held) {
      const deadline = addDays(h.oldest, 1);
      out.push({ id: `cashho:${s.project}:${id}:${h.n}`, role: 'manager', project: s.project, pname: s.proj.name, what: `Hand over ${rs(h.amt)} cash to the Accountant`,
        detail: `${h.n} confirmed payment${h.n === 1 ? '' : 's'} since ${h.oldest}`, since: h.oldest, deadline, overdue: late(deadline), href: '/payments?via=Cash', forId: id, forName: h.name });
    }
    for (const h of s.handovers.filter(x => x.status === 'pending')) {
      const deadline = addDays(h.d, 1);
      out.push({ id: `cashrc:${s.project}:${h.id}`, role: 'accountant', project: s.project, pname: s.proj.name, what: `Receive ${rs(h.amount)} cash from ${h.fromName}`,
        detail: `${h.id} · ${h.paymentIds.length} payment${h.paymentIds.length === 1 ? '' : 's'}: count it and confirm`, since: h.d, deadline, overdue: late(deadline), href: '/payments?via=Cash#receive' });
    }
    const bank = s.handovers.filter(x => x.status === 'received' && !x.depositSlip);
    if (bank.length) {
      const since = bank.map(h => h.receivedD || h.d).sort()[0], deadline = addDays(since, 2), amt = bank.reduce((a, h) => a + h.amount, 0);
      out.push({ id: `cashdp:${s.project}:${bank.length}`, role: 'accountant', project: s.project, pname: s.proj.name, what: `Deposit ${rs(amt)} cash in the bank`,
        detail: `${bank.length} received hand-over${bank.length === 1 ? '' : 's'} not deposited yet`, since, deadline, overdue: late(deadline), href: '/payments?via=Cash#deposit' });
    }
    return out;
  });
}

/** Whose work a role's tasks are, for "Responsible" columns: the building's managers, or the accountants. */
export function responsible(t: Task, staff: Staff[]) {
  if (t.forName) return t.forName;
  const names = t.role === 'manager'
    ? staff.filter(x => x.active && x.role === 'manager' && (x.projects || []).includes(t.project)).map(x => x.name)
    : staff.filter(x => x.active && x.role === 'accountant' && (!(x.projects || []).length || (x.projects || []).includes(t.project))).map(x => x.name);
  return names.length ? names.join(', ') : t.role === 'manager' ? 'No building manager yet' : 'No accountant yet';
}

/** The tasks that are this person's own work. */
export const myTasks = (all: Task[], me: Staff) => me.role === 'manager' ? all.filter(t => t.role === 'manager' && (!t.forId || t.forId === me.id))
  : me.role === 'accountant' ? all.filter(t => t.role === 'accountant') : [];

/** Building managers assigned to a project (names). */
export const managersOf = (pid: string, staff: Staff[]) => staff.filter(x => x.active && x.role === 'manager' && (x.projects || []).includes(pid)).map(x => x.name);
