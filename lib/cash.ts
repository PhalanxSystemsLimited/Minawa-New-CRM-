// Cash follow-up (17 Nov 2026). Payments are cash only, so every rupee is followed from the person who took it to the
// bank: building manager (or the office) → hand-over to the Accountant → bank deposit. Worked out from the data in
// each building's state; nothing extra is stored apart from the hand-overs themselves.
import type { Handover, Payment, Proof, State } from './types';
import { use, ownerById } from './engine';

export interface CashRow {
  project: string; pname: string; collectorId: string; name: string;
  /** In hand at the start of the day, taken that day, handed over that day, in hand at the end of the day. */
  open: number; collected: number; handed: number; close: number; nCollected: number;
}
export interface DayCash {
  d: string; rows: CashRow[];
  received: { h: Handover; pname: string }[]; deposited: { h: Handover; pname: string }[];
  pending: { pr: Proof; pname: string; apt: string }[];
}

const live = (p: Payment) => !p.reversed && !!p.collectorId;
/** Is this payment still with the person who took it at the end of day d? */
function inHandAt(p: Payment, s: State, d: string) {
  if (p.d > d) return false;
  if (!p.handoverId) return true;
  const h = s.handovers.find(x => x.id === p.handoverId);
  return !h || h.d > d;
}

/** The daily reconciliation for one day across the given buildings. */
export function dayCash(states: State[], d: string): DayCash {
  const out: DayCash = { d, rows: [], received: [], deposited: [], pending: [] };
  for (const s of states) use(s, () => {
    const who = new Map<string, string>();
    for (const p of s.payments) if (live(p)) who.set(p.collectorId!, p.collectorName || 'Building manager');
    for (const h of s.handovers) if (h.fromId) who.set(h.fromId, h.fromName.replace(/ \(office\)$/, ''));
    for (const [id, name] of who) {
      const mine = s.payments.filter(p => live(p) && p.collectorId === id);
      const prev = mine.filter(p => p.d < d), today = mine.filter(p => p.d === d);
      const open = prev.filter(p => inHandAt(p, s, addDay(d, -1))).reduce((a, p) => a + p.amount, 0);
      const collected = today.reduce((a, p) => a + p.amount, 0);
      // Handed over: the payments in that day's hand-overs that still stand (a payment reversed later drops out here too,
      // so start + taken − handed over = end always adds up).
      const hos = new Set(s.handovers.filter(h => h.fromId === id && h.d === d && h.status !== 'disputed').map(h => h.id));
      const handed = mine.filter(p => p.handoverId && hos.has(p.handoverId)).reduce((a, p) => a + p.amount, 0);
      const close = mine.filter(p => inHandAt(p, s, d)).reduce((a, p) => a + p.amount, 0);
      if (open || collected || handed || close) out.rows.push({ project: s.project, pname: s.proj.name, collectorId: id, name, open, collected, handed, close, nCollected: today.length });
    }
    for (const h of s.handovers) {
      if (h.status === 'received' && h.receivedD === d) out.received.push({ h, pname: s.proj.name });
      if (h.depositD === d) out.deposited.push({ h, pname: s.proj.name });
    }
    for (const pr of s.proofs) if (pr.kind === 'cash' && pr.status === 'pending' && pr.d <= d) out.pending.push({ pr, pname: s.proj.name, apt: ownerById(pr.ownerId)?.apt || '' });
  });
  out.rows.sort((a, b) => a.pname.localeCompare(b.pname) || a.name.localeCompare(b.name));
  return out;
}
const addDay = (d: string, n: number) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);

/** Where the money is right now, across the given buildings. */
export function cashNow(states: State[]) {
  const withStaff: { project: string; pname: string; collectorId: string; name: string; amount: number; n: number; oldest: string; list: Payment[] }[] = [];
  const toReceive: { h: Handover; pname: string }[] = [], toDeposit: { h: Handover; pname: string }[] = [], history: { h: Handover; pname: string }[] = [];
  const unconfirmed: { pr: Proof; pname: string; apt: string }[] = [];
  for (const s of states) use(s, () => {
    const groups = new Map<string, Payment[]>();
    for (const p of s.payments) if (live(p) && !p.handoverId) groups.set(p.collectorId!, [...(groups.get(p.collectorId!) || []), p]);
    for (const [id, list] of groups) withStaff.push({ project: s.project, pname: s.proj.name, collectorId: id, name: list[0].collectorName || 'Building manager', amount: list.reduce((a, p) => a + p.amount, 0), n: list.length, oldest: list.map(p => p.d).sort()[0], list });
    for (const h of s.handovers) {
      if (h.status === 'pending') toReceive.push({ h, pname: s.proj.name });
      if (h.status === 'received' && !h.depositSlip) toDeposit.push({ h, pname: s.proj.name });
      history.push({ h, pname: s.proj.name });
    }
    for (const pr of s.proofs) if (pr.kind === 'cash' && pr.status === 'pending') unconfirmed.push({ pr, pname: s.proj.name, apt: ownerById(pr.ownerId)?.apt || '' });
  });
  const by = (a: { h: Handover }, b: { h: Handover }) => `${b.h.d} ${b.h.t}`.localeCompare(`${a.h.d} ${a.h.t}`);
  history.sort(by); toReceive.sort(by); toDeposit.sort(by);
  return { withStaff, toReceive, toDeposit, history, unconfirmed };
}
