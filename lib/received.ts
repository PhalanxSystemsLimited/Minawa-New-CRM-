// Received payments (18 Nov 2026): approved payments across the buildings a person can open, with who entered and
// who approved each one. Shared by the Received payments page and its CSV.
import type { State, Payment } from './types';
import { use, ownerById } from './engine';

export interface RecRow { p: Payment; pname: string; apt: string; owner: string; via: 'Cash' | 'Bank transfer'; enteredBy: string; approvedBy: string }

/** Older payments only have "by" ("Name, checked by Accountant"): split it. */
export function whoOf(p: Payment) {
  if (p.enteredBy || p.approvedBy) return { enteredBy: p.enteredBy || '', approvedBy: p.approvedBy || '' };
  const m = /^(.*?), (?:checked|approved) by (.*)$/.exec(p.by || '');
  return m ? { enteredBy: m[1], approvedBy: m[2] } : { enteredBy: p.by || '', approvedBy: p.by || '' };
}

export function receivedRows(states: State[], f: { month?: string; via?: string; who?: string } = {}): RecRow[] {
  const out: RecRow[] = [];
  for (const s of states) use(s, () => {
    for (const p of s.payments) {
      if (f.month && p.d.slice(0, 7) !== f.month) continue;
      const via = /bank/i.test(p.method) ? 'Bank transfer' : 'Cash';
      if (f.via && f.via !== via) continue;
      const w = whoOf(p);
      if (f.who && w.enteredBy !== f.who && w.approvedBy !== f.who) continue;
      const o = ownerById(p.ownerId);
      out.push({ p, pname: s.proj.name, apt: o?.apt || '', owner: o?.name || '', via, ...w });
    }
  });
  return out.sort((a, b) => `${b.p.d} ${b.p.t}`.localeCompare(`${a.p.d} ${a.p.t}`));
}
