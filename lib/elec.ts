// Electricity bills (21 Nov 2026): when a bill can still be corrected, and how its line reads. Engine scope (cur()).
import { cur } from './engine';
import { fm } from './fmt';
import type { Bill, Charge } from './types';

/** Why a bill can't be changed any more (money has reached it, or a payment for it is waiting), or null. */
export function elecLocked(b: Bill): string | null {
  const s = cur();
  if (b.paid > 0 || b.finePaid > 0) return 'It has been paid (fully or in part), so it is history now';
  if (s.payments.some(p => !p.reversed && p.applied.some(a => a.ref === b.id))) return 'A payment has reached it, so it is history now';
  if (s.proofs.some(p => p.status === 'pending' && p.billId === b.id)) return 'A payment for it is waiting for the Accountant';
  return null;
}
/** The bill line: what the bill paper says (units, and the meter reading on it). */
export const elecLabel = (c: Pick<Charge, 'kind' | 'period' | 'units' | 'curReading'>) =>
  `${c.kind}, ${fm(c.period)}${c.units != null ? ` (${c.units} units)` : ''}${c.curReading != null ? ` · meter reading on bill ${c.curReading}` : ''}`;
/** The electricity charge on a bill (one per bill when entered on the Electricity screen). */
export const elecCharge = (b: Bill) => cur().charges.find(c => c.billId === b.id && c.kind === 'Electricity') || null;
