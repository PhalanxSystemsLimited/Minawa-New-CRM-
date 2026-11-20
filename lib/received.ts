// Payments (21 Nov 2026; was Received payments, 18 Nov): every payment in the buildings a person can open, with who
// entered it and who confirmed it. A building manager's entry counts for the customer from the moment it is entered;
// until the Accountant confirms the money it is "not confirmed yet", then "confirmed". Shared by the Payments screen
// and its CSV.
import type { State, Payment } from './types';
import { use, ownerById } from './engine';

export interface RecRow { p: Payment; pname: string; apt: string; owner: string; via: 'Cash' | 'Bank transfer'; enteredBy: string; enteredById: string | null; approvedBy: string; waiting: boolean }

/** Older payments only have "by" ("Name, checked by Accountant"): split it. */
export function whoOf(p: Payment) {
  if (p.enteredBy || p.approvedBy) return { enteredBy: p.enteredBy || '', approvedBy: p.approvedBy || '' };
  const m = /^(.*?), (?:checked|approved) by (.*)$/.exec(p.by || '');
  return m ? { enteredBy: m[1], approvedBy: m[2] } : { enteredBy: p.by || '', approvedBy: p.by || '' };
}
/** A building manager's entry the Accountant hasn't confirmed yet. */
export const isWaiting = (p: Payment) => !!p.entryId && !p.approvedBy;

export function receivedRows(states: State[], f: { month?: string; via?: string; who?: string; status?: '' | 'waiting' | 'confirmed'; mine?: string | null } = {}): RecRow[] {
  const out: RecRow[] = [];
  for (const s of states) use(s, () => {
    for (const p of s.payments) {
      if (p.reversed) continue;
      const waiting = isWaiting(p);
      if (f.status === 'waiting' && !waiting) continue;
      if (f.status === 'confirmed' && waiting) continue;
      if (f.month && p.d.slice(0, 7) !== f.month) continue;
      const via = /bank/i.test(p.method) ? 'Bank transfer' : 'Cash';
      if (f.via && f.via !== via) continue;
      const w = whoOf(p), enteredById = p.entryId ? s.proofs.find(x => x.id === p.entryId)?.byId || null : p.collectorId || null;
      if (f.who && w.enteredBy !== f.who && w.approvedBy !== f.who) continue;
      if (f.mine && enteredById !== f.mine) continue;
      const o = ownerById(p.ownerId);
      out.push({ p, pname: s.proj.name, apt: o?.apt || '', owner: o?.name || '', via, ...w, approvedBy: waiting ? '' : w.approvedBy, enteredById, waiting });
    }
  });
  return out.sort((a, b) => `${b.p.d} ${b.p.t}`.localeCompare(`${a.p.d} ${a.p.t}`));
}
