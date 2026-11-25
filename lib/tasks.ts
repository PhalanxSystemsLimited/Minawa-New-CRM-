// The To do list (Nov 2026). Since 25 Nov 2026 every task is the Accountant's: building managers only enter payments
// and send the receipt on WhatsApp from the locked screen that follows (a receipt they cancel lands here). The
// Accountant: receipts not sent, WhatsApp to send (bills, reminders, notices, links), printed vouchers, numbers to fix,
// broken promises and late instalments, meter readings, and the money to check: his building managers' entries one by
// one, owners' bank screenshots, cash to deposit. For his buildings (ticked for him, or his building managers').
//  · Admin: does none of these; sees the list to monitor who is responsible and what is late.
// Tasks are worked out from the project's data every time (nothing extra is stored), so every screen agrees.
import type { State, Staff } from './types';
import { use, ownerById, failedList, instalmentStatus } from './engine';
import { toDoGroups, pendingGroups } from './manual-send';
import { addDays, rs, fm } from './fmt';
import { meterMode, readDay } from './meter';
import { voucherRows, DUES } from './vouchers';
import { scoped } from './people';

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
      out.push({ id: `rcpt:${m.id}`, role: 'accountant', kind: 'receipt', project: s.project, pname: s.proj.name, what: 'Send the receipt',
        detail: pay ? `${rs(pay.amount)} · ${pay.receipt} · ${/bank/i.test(pay.method) ? 'bank transfer' : 'cash'}${pay.enteredBy ? ` · entered by ${pay.enteredBy}` : ''}` : m.title,
        apt: o.apt, owner: o.name, since: m.d, time: m.t, enteredById: entry?.byId || null, deadline: m.d, overdue: late(m.d), href: `${P}/send?type=queue&kind=receipt&ids=${o.id}&go=1` });
    }
    for (const g of toDoGroups()) {
      if (g.key === 'receipt') continue;
      const deadline = g.since;   // made at 11:00 AM: meant to go out the same day
      out.push({ id: `send:${s.project}:${g.key}`, role: 'accountant', project: s.project, pname: s.proj.name, what: `Send on WhatsApp: ${g.label.toLowerCase()}`,
        detail: `${g.n} owner${g.n === 1 ? '' : 's'} waiting`, since: g.since, deadline, overdue: late(deadline), href: `${P}/send?type=queue&kind=${g.key}&go=1` });
    }
    // Customers without WhatsApp: their bills, warnings and receipts are printed and delivered by hand (one task).
    const vr = voucherRows().filter(r => r.items.length);
    if (vr.length) {
      const since = vr.flatMap(r => r.items.map(i => i.msg.d)).sort()[0], deadline = addDays(since, 2), n = vr.reduce((a, r) => a + r.items.length, 0);
      out.push({ id: `print:${s.project}`, role: 'accountant', project: s.project, pname: s.proj.name, what: 'Deliver printed vouchers',
        detail: `${vr.length} customer${vr.length === 1 ? '' : 's'} without WhatsApp · ${n} paper${n === 1 ? '' : 's'} to print`, since, deadline, overdue: late(deadline), href: `${P}/send?mode=print` });
    }
    for (const m of failedList()) {
      const o = ownerById(m.ownerId), deadline = addDays(m.d, 2);
      if (o.noPhone && DUES.includes(m.kind)) continue;   // on the printed vouchers list instead
      out.push({ id: `fix:${m.id}`, role: 'accountant', project: s.project, pname: s.proj.name, what: o.noPhone ? 'Add a WhatsApp number' : 'Fix the WhatsApp number',
        detail: m.title, apt: o.apt, owner: o.name, since: m.d, deadline, overdue: late(deadline), href: `${P}/apartments/${o.id}?m=fix&from=todo` });
    }
    for (const a of s.alerts.filter(x => !x.done)) {
      const o = ownerById(a.ownerId), entry = a.kind === 'entry', deadline = addDays(a.d, entry ? 1 : 2);
      out.push({ id: `alert:${a.id}`, role: 'accountant', project: s.project, pname: s.proj.name, what: entry ? 'Put right a payment the Accountant didn\'t receive' : 'Follow up a broken promise to pay',
        detail: a.text, apt: o.apt, owner: o.name, since: a.d, deadline, overdue: late(deadline), href: `${P}/apartments/${o.id}` });
    }
    for (const o of s.owners) {
      if (o.status !== 'active' || !o.instalments) continue;
      const st = instalmentStatus(o), late1 = st?.items.find(x => x.state === 'overdue');
      if (!st || !late1) continue;
      out.push({ id: `inst:${o.id}:${late1.n}`, role: 'accountant', project: s.project, pname: s.proj.name, what: 'Follow up a late instalment',
        detail: `Instalment ${late1.n} of ${st.items.length}: ${rs(late1.left)} was due ${late1.due}`, apt: o.apt, owner: o.name, since: late1.due, deadline: addDays(late1.due, 3), overdue: late(addDays(late1.due, 3)), href: `${P}/apartments/${o.id}` });
    }
    for (const pr of s.proofs.filter(x => x.status === 'pending')) {
      const o = ownerById(pr.ownerId), deadline = addDays(pr.d, 1), cash = pr.kind === 'cash';
      out.push({ id: `proof:${pr.id}`, role: 'accountant', project: s.project, pname: s.proj.name, what: cash ? 'Confirm a cash payment from a building manager' : 'Check a bank transfer',
        detail: cash ? `${rs(pr.amount)} · recorded by ${pr.byName || 'a building manager'}${pr.ref ? ` · ref ${pr.ref}` : ''}` : `${rs(pr.amount)} · screenshot sent by the owner`,
        apt: o.apt, owner: o.name, since: pr.d, deadline, overdue: late(deadline), href: `/tasks#proof-${pr.id}` });
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
    // Sub-meters (Country Club, 21 Nov 2026): from the Admin's reading day, the flats still to read this month.
    if (meterMode()) {
      const p = s.today.slice(0, 7), since = `${p}-${String(readDay()).padStart(2, '0')}`;
      if (s.today >= since) {
        const left = s.owners.filter(o => o.status === 'active' && !o.exempt && !s.charges.some(c => c.ownerId === o.id && c.kind === 'Electricity' && c.period === p && c.billId)).length;
        if (left) { const deadline = addDays(since, 3);
          out.push({ id: `meter:${s.project}:${p}`, role: 'accountant', project: s.project, pname: s.proj.name, what: `Enter the meter readings for ${fm(p)}`,
            detail: `${left} flat${left === 1 ? '' : 's'} still to read; each bill is units used × the unit rate`, since, deadline, overdue: late(deadline), href: `${P}/electricity?tab=add&period=${p}` }); }
      }
    }
    return out;
  });
}

/** Whose work a task is: the accountants who look after the building (ticked for them, or their building managers'). */
export function responsible(t: Task, staff: Staff[]) {
  if (t.forName) return t.forName;
  const names = staff.filter(x => x.active && !x.leftOn && x.role === 'accountant' && accountantSees(x, t.project, staff)).map(x => x.name);
  return names.length ? names.join(', ') : 'No accountant yet';
}
/** Does this accountant look after the building? (Ticked for him, his building managers' building, or none ticked at all.) */
export const accountantSees = (a: Staff, pid: string, staff: Staff[]) => { const p = scoped(a, staff).projects || []; return !p.length || p.includes(pid); };

/** The tasks that are this person's own work (a building manager has none since 25 Nov 2026). */
export const myTasks = (all: Task[], me: Staff) => me.role === 'accountant' ? all.filter(t => t.role === 'accountant') : [];

/** Building managers assigned to a project (names). */
export const managersOf = (pid: string, staff: Staff[]) => staff.filter(x => x.active && x.role === 'manager' && (x.projects || []).includes(pid)).map(x => x.name);
