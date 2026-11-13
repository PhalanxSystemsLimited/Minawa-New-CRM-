// Queries shared by pages and API routes. Call inside use(state, …).
import type { Payment } from './types';
import { cur, sortedPayments, ownerById } from './engine';
import { prevMonth } from './fmt';

export const famOf = (m: string) => /Card/i.test(m) ? 'Card' : 'Bank';
export function payFiltered(per: string, fam: string, q: string): Payment[] {
  const S = cur(), mon = S.today.slice(0, 7), lm = prevMonth(mon), qq = q.trim().toLowerCase();
  return sortedPayments().filter(p => {
    const o = ownerById(p.ownerId);
    return (per === 'all' || p.d.slice(0, 7) === (per === 'month' ? mon : lm)) && (fam === 'all' || famOf(p.method) === fam)
      && (!qq || `${o.name} ${o.apt} ${p.receipt} ${p.ref} ${p.spTracker || ''}`.toLowerCase().includes(qq));
  });
}
