// Building stats for the dashboards (Phase 4, 18 Nov 2026): one card per building the person looks after (the Admin:
// every building). Only approved payments count as collected; entries still waiting for the Accountant are shown
// next to them. Call with a loaded project state.
import type { State, Staff } from './types';
import { use, apartments, balance, billsOf, openingDue, hasGenerator } from './engine';

export interface BuildingStats {
  pid: string; name: string; month: string;
  billed: number; nBills: number; collected: number; cash: number; bank: number; nPays: number;
  pending: number; nPending: number; toCollect: number; owing: number;
  pastDue: number; nPastDue: number; vacant: number; noPos: number; active: number; requests: number;
  elec: { billed: number; collected: number; unpaid: number } | null;
  gen: { flats: number; billed: number } | null;
}

export function buildingStats(s: State, me: Staff): BuildingStats {
  return use(s, () => {
    const month = s.today.slice(0, 7), apts = apartments(), act = apts.filter(o => o.status === 'active' && !o.exempt);
    const mb = s.bills.filter(b => b.months > 0 && b.billDate.slice(0, 7) === month), pays = s.payments.filter(p => p.d.slice(0, 7) === month);
    const bank = pays.filter(p => /bank/i.test(p.method)).reduce((a, p) => a + p.amount, 0), collected = pays.reduce((a, p) => a + p.amount, 0);
    const pend = s.proofs.filter(p => p.kind === 'cash' && p.status === 'pending');
    const late = act.filter(o => balance(o) > 0 && (billsOf(o).some(b => b.net - b.paid > 0 && b.dueDate < s.today) || ((o.openingLeft || 0) > 0 && s.today > openingDue())));
    const ub = s.bills.filter(b => !b.months), ubIds = new Set(ub.map(b => b.id));
    const elec = ub.length ? { billed: ub.filter(b => b.billDate.slice(0, 7) === month).reduce((a, b) => a + b.net, 0),
      collected: pays.reduce((a, p) => a + (p.applied || []).filter(x => x.ref && ubIds.has(x.ref)).reduce((t, x) => t + x.amount, 0), 0), unpaid: ub.reduce((a, b) => a + Math.max(0, b.net - b.paid), 0) } : null;
    const gen = hasGenerator() ? { flats: act.filter(o => o.generator).length, billed: mb.reduce((a, b) => a + b.lines.filter(l => l.kind === 'generator').reduce((t, l) => t + l.amount, 0), 0) } : null;
    const bals = act.map(o => balance(o));
    return { pid: s.project, name: s.proj.name, month,
      billed: mb.reduce((a, b) => a + b.net, 0), nBills: mb.length, collected, cash: collected - bank, bank, nPays: pays.length,
      pending: pend.reduce((a, p) => a + p.amount, 0), nPending: pend.length, toCollect: bals.reduce((a, b) => a + Math.max(0, b), 0), owing: bals.filter(b => b > 0).length,
      pastDue: late.reduce((a, o) => a + balance(o), 0), nPastDue: late.length, vacant: apts.filter(o => o.status === 'closed').length,
      noPos: act.filter(o => !o.possessionKnown).length, active: act.length,
      requests: s.approvals.filter(a => a.status === 'pending' && (me.role === 'admin' || a.byId === me.id)).length, elec, gen };
  });
}
