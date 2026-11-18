// Reports (17 Nov 2026): the defaulters / dues list and the monthly collection report per building. Shared by the
// Reports page and its CSV exports. Call inside use(state, …).
import type { State } from './types';
import { use, apartments, aptOrder, balance, billsOf, unpaid, unpaidMaint, ownerStatus, openingDue, type OwnerStatus } from './engine';
import { diff } from './fmt';

export interface DueRow {
  project: string; pname: string; ownerId: string; apt: string; block: string; name: string; phone: string;
  arrears: number; bills: number; nBills: number; fine: number; other: number; total: number; oldestDue: string | null; daysOver: number; status: OwnerStatus; promise: string | null;
}

/** Every apartment that owes money now, worst first (most days overdue, then the biggest amount). */
export function duesList(states: State[], onlyOverdue = false): DueRow[] {
  const out: DueRow[] = [];
  for (const s of states) use(s, () => {
    for (const o of apartments().sort(aptOrder)) {
      if (o.status !== 'active' || o.exempt) continue;
      const total = balance(o); if (total <= 0) continue;
      const open = billsOf(o).filter(b => unpaid(b) > 0);
      const bills = open.reduce((a, b) => a + unpaidMaint(b), 0), fine = open.reduce((a, b) => a + (b.fine - b.finePaid), 0);
      const dues = [...(o.openingLeft > 0 ? [openingDue()] : []), ...open.filter(b => unpaidMaint(b) > 0).map(b => b.dueDate)].sort();
      const oldestDue = dues[0] || null, daysOver = oldestDue && s.today > oldestDue ? diff(s.today, oldestDue) : 0;
      const st = ownerStatus(o);
      if (onlyOverdue && st !== 'overdue' && st !== 'flagged') continue;
      out.push({ project: s.project, pname: s.proj.name, ownerId: o.id, apt: o.apt, block: o.block, name: o.name, phone: o.noPhone ? '' : o.phone,
        arrears: o.openingLeft || 0, bills, nBills: open.length, fine, other: Math.max(0, total - (o.openingLeft || 0) - bills - fine), total, oldestDue, daysOver, status: st, promise: o.promiseUntil && o.promiseUntil >= s.today ? o.promiseUntil : null });
    }
  });
  return out.sort((a, b) => b.daysOver - a.daysOver || b.total - a.total);
}

export interface MonthReport {
  project: string; pname: string; month: string;
  billed: number; nBills: number; collected: number; nPays: number; reversed: number;
  byCollector: { name: string; amount: number; n: number }[];
  byDay: { d: string; amount: number; n: number }[];
  outstanding: number; owing: number; aptCount: number; paidUp: number;
  /** Electricity (Oakwood): billed this month, collected this month, still unpaid (all months), customers who owe it. */
  elec: { billed: number; n: number; collected: number; unpaid: number; owing: number };
}

/** One building's month: what was billed, what came in (and who took it), and what is still owed today. */
export function monthReport(s: State, month: string): MonthReport {
  return use(s, () => {
    const bills = s.bills.filter(b => b.billDate.slice(0, 7) === month), pays = s.payments.filter(p => p.d.slice(0, 7) === month);
    const coll = new Map<string, { name: string; amount: number; n: number }>(), days = new Map<string, { d: string; amount: number; n: number }>();
    for (const p of pays) {
      const k = p.collectorName || (p.by || 'Office').replace(/, checked by .*$/, '');
      const c = coll.get(k) || { name: k, amount: 0, n: 0 }; c.amount += p.amount; c.n++; coll.set(k, c);
      const d = days.get(p.d) || { d: p.d, amount: 0, n: 0 }; d.amount += p.amount; d.n++; days.set(p.d, d);
    }
    const act = apartments().filter(o => o.status === 'active' && !o.exempt), bals = act.map(o => balance(o));
    const ub = s.bills.filter(b => !b.months), ubIds = new Set(ub.map(b => b.id));
    const elec = { billed: ub.filter(b => b.billDate.slice(0, 7) === month).reduce((a, b) => a + b.net, 0), n: ub.filter(b => b.billDate.slice(0, 7) === month).length,
      collected: pays.reduce((a, p) => a + (p.applied || []).filter(x => x.ref && ubIds.has(x.ref)).reduce((t, x) => t + x.amount, 0), 0),
      unpaid: ub.reduce((a, b) => a + Math.max(0, b.net - b.paid), 0), owing: new Set(ub.filter(b => b.net - b.paid > 0).map(b => b.ownerId)).size };
    return { project: s.project, pname: s.proj.name, month,
      billed: bills.reduce((a, b) => a + b.net, 0), nBills: bills.length,
      collected: pays.reduce((a, p) => a + p.amount, 0), nPays: pays.length, reversed: 0,
      byCollector: [...coll.values()].sort((a, b) => b.amount - a.amount), byDay: [...days.values()].sort((a, b) => a.d.localeCompare(b.d)),
      outstanding: bals.reduce((a, b) => a + Math.max(0, b), 0), owing: bals.filter(b => b > 0).length, aptCount: act.length, paidUp: bals.filter(b => b <= 0).length, elec };
  });
}
