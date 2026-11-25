// Payment requests (26 Nov 2026). The accountant picks a customer with dues and asks a building manager to collect
// an amount, by cash or bank transfer, for the months he sets. The building manager's only screen is the list of
// his open requests; he answers one with an entry (the cash book number he wrote by hand, or the bank transfer's ID
// and photo). The entry counts for the customer at once (as before), but no receipt goes out then: the accountant
// approves the entry once the money reaches him, and only then is the receipt (with the months it pays for) waiting
// in his To do › Receipts to send. Call these inside the engine (use / mutate).
import type { Owner, PayRequest } from './types';
import { cur, nid, log, ownerById, balance, recordCash, billsOf, unpaid, isUtilBill, goLive } from './engine';
import { rs, periodText, fm } from './fmt';

const nextM = (p: string) => new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 1)).toISOString().slice(0, 7);

/** What a customer still owes, year by year (26 Nov 2026): unpaid bills by the year of their months, old dues from
 *  before the CRM, and anything else (adjustments). What is left of one year simply carries into the next year's
 *  balance, and this keeps the record of how much of it is from which year. */
export function yearDues(o: Owner) {
  const by = new Map<string, number>();
  for (const b of billsOf(o)) { const u = unpaid(b); if (u > 0) by.set(b.period.slice(0, 4), (by.get(b.period.slice(0, 4)) || 0) + u); }
  const rows: { label: string; amount: number }[] = [];
  const old = Math.max(0, o.openingLeft || 0);
  if (old) rows.push({ label: `Before ${fm(goLive().slice(0, 7))}`, amount: old });
  for (const [y, a] of [...by].sort()) rows.push({ label: y, amount: a });
  if ((o.feeDue || 0) > 0) rows.push({ label: 'Fines', amount: o.feeDue });
  const rest = Math.max(0, balance(o)) - rows.reduce((a, r) => a + r.amount, 0);
  if (rest > 0) rows.push({ label: 'Other charges', amount: rest });
  return rows;
}
/** "2026: Rs 20,000 · 2027: Rs 30,000" (empty when it is all from one year). */
export const yearsText = (o: Owner) => { const r = yearDues(o); return r.length > 1 ? r.map(x => `${x.label}: ${rs(x.amount)}`).join(' · ') : ''; };

/** What is still unpaid for these months (26 Nov 2026), so the same months are never asked for twice: the unpaid
 *  bills that cover them (maintenance, or electricity), old dues when the months go back before the CRM, and whether
 *  the months include ones after this month with no bill yet (an advance payment). */
export function intervalDue(o: Owner, from: string, to: string, forWhat: 'maintenance' | 'electricity' | null = 'maintenance') {
  const now = cur().today.slice(0, 7), billed = new Set<string>();
  let left = 0;
  for (const b of billsOf(o)) {
    if (forWhat === 'electricity' ? !isUtilBill(b) : isUtilBill(b)) continue;
    const bf = b.period, bt = b.periodEnd || b.period;
    for (let m = bf; m <= bt; m = nextM(m)) billed.add(m);
    if (bt < from || bf > to) continue;
    left += Math.max(0, unpaid(b));
  }
  if (forWhat !== 'electricity' && from < goLive().slice(0, 7)) left += Math.max(0, o.openingLeft || 0);
  let ahead = false;
  for (let m = from; m <= to; m = nextM(m)) if (m > now && !billed.has(m)) { ahead = true; break; }
  return { left, ahead };
}
/** Months shown as paid in full in the request form (bills covering them, none unpaid). */
export function paidMonths(o: Owner, forWhat: 'maintenance' | 'electricity' = 'maintenance') {
  const owed = new Set<string>(), billed = new Set<string>();
  for (const b of billsOf(o)) {
    if (forWhat === 'electricity' ? !isUtilBill(b) : isUtilBill(b)) continue;
    for (let m = b.period; m <= (b.periodEnd || b.period); m = nextM(m)) { billed.add(m); if (unpaid(b) > 0) owed.add(m); }
  }
  return new Set([...billed].filter(m => !owed.has(m)));
}

export const requestsOf = () => cur().requests || (cur().requests = []);
export const openRequestFor = (oid: string) => requestsOf().find(r => r.ownerId === oid && r.status === 'open') || null;

/** A new payment request. */
export function newRequest(o: Owner, x: { amount: number; method: PayRequest['method']; periodFrom: string; periodTo: string; forWhat: PayRequest['forWhat']; note: string; managerId: string; managerName: string },
  by: { id: string | null; name: string }, d: string, t: string): PayRequest {
  if (o.status !== 'active') throw new Error(`${o.apt} has no active customer.`);
  if (openRequestFor(o.id)) throw new Error(`${o.apt} already has an open payment request. Cancel it first to ask again.`);
  // The same months are never asked for twice: only what is still unpaid for them (an advance for months not billed
  // yet can always be asked for).
  const iv = intervalDue(o, x.periodFrom, x.periodTo, x.forWhat), when = periodText(x.periodFrom, x.periodTo);
  if (iv.left <= 0 && !iv.ahead) throw new Error(`${when} is already paid in full for ${o.apt}: nothing is left to collect for these months. Choose the months that are still unpaid.`);
  if (!iv.ahead && x.amount > iv.left) throw new Error(`Only ${rs(iv.left)} is left to pay for ${when}. Ask for ${rs(iv.left)} or less, or include the months that are still owed.`);
  const r: PayRequest = { id: 'RQ-' + (1000 + nid('rq')), project: cur().project, ownerId: o.id, amount: x.amount, method: x.method, periodFrom: x.periodFrom, periodTo: x.periodTo,
    forWhat: x.forWhat, note: x.note || null, managerId: x.managerId, managerName: x.managerName, byId: by.id, byName: by.name, d, t, status: 'open', proofId: null, doneD: null, doneT: null, reply: null };
  requestsOf().push(r);
  log(d, t, 'payment', `Payment request ${r.id} by ${by.name}: ${x.managerName} to collect ${rs(x.amount)} ${x.method === 'Cash' ? 'cash' : 'by bank transfer'} from ${o.apt} (${o.name}) for ${periodText(x.periodFrom, x.periodTo)}${x.note ? `. Note: ${x.note}` : ''}. Owed then: ${rs(Math.max(0, balance(o)))}`, o.id);
  return r;
}

/** The accountant takes a request back (before it is answered). */
export function cancelRequest(r: PayRequest, by: string, why: string, d: string, t: string) {
  if (r.status !== 'open') throw new Error('Only an open request can be cancelled.');
  Object.assign(r, { status: 'cancelled', doneD: d, doneT: t, reply: why || null });
  log(d, t, 'payment', `Payment request ${r.id} for ${ownerById(r.ownerId)?.apt} cancelled by ${by}${why ? `: ${why}` : ''}`, r.ownerId);
}

/** The building manager answers a request with his entry. */
export function enterRequest(r: PayRequest, x: { amount: number; ref: string; txn: string; photoId: string | null; paidOn: string; note: string }, byId: string, byName: string, d: string, t: string) {
  if (r.status !== 'open') throw new Error('This request was already answered or cancelled.');
  if (r.managerId !== byId) throw new Error('This request is for another building manager.');
  const o = ownerById(r.ownerId); if (!o) throw new Error('The customer was not found.');
  const pr = recordCash(o, x.amount, x.paidOn, x.ref, x.note, d, t, byId, byName, r.method, x.txn, r.forWhat, { photoId: x.photoId, periodFrom: r.periodFrom, periodTo: r.periodTo, requestId: r.id });
  Object.assign(r, { status: 'entered', proofId: pr.id, doneD: d, doneT: t, reply: null });
  return pr;
}
