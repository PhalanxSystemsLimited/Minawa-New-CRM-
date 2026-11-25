// Payment requests (26 Nov 2026). The accountant picks a customer with dues and asks a building manager to collect
// an amount, by cash or bank transfer, for the months he sets. The building manager's only screen is the list of
// his open requests; he answers one with an entry (the cash book number he wrote by hand, or the bank transfer's ID
// and photo). The entry counts for the customer at once (as before), but no receipt goes out then: the accountant
// approves the entry once the money reaches him, and only then is the receipt (with the months it pays for) waiting
// in his To do › Receipts to send. Call these inside the engine (use / mutate).
import type { Owner, PayRequest } from './types';
import { cur, nid, log, ownerById, balance, recordCash } from './engine';
import { rs, periodText } from './fmt';

export const requestsOf = () => cur().requests || (cur().requests = []);
export const openRequestFor = (oid: string) => requestsOf().find(r => r.ownerId === oid && r.status === 'open') || null;

/** A new payment request. */
export function newRequest(o: Owner, x: { amount: number; method: PayRequest['method']; periodFrom: string; periodTo: string; forWhat: PayRequest['forWhat']; note: string; managerId: string; managerName: string },
  by: { id: string | null; name: string }, d: string, t: string): PayRequest {
  if (o.status !== 'active') throw new Error(`${o.apt} has no active customer.`);
  if (openRequestFor(o.id)) throw new Error(`${o.apt} already has an open payment request. Cancel it first to ask again.`);
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
