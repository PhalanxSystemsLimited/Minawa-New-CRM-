// Changes to what an owner is charged: discount, Generator Charges List, billing plan, the flat's own monthly fee and
// adjustments (extra charges, credits or waivers). An admin's change applies at once. An accountant's waits as an
// approval request on the admin's dashboard and applies only when an admin approves it.
// Everything here runs inside the engine (lib/ops.mutate → use), on the project being changed.
import type { Owner, Approval, ApprovalKind, Plan } from './types';
import { PLAN_LABEL } from './types';
import { cur, log, at, nid, ownerById, balance, nextPeriodFor, rateOf, cardRate, billDateOf, hasGenerator, waive } from './engine';
import { fd, fm, rs } from './fmt';

export const KIND_LABEL: Record<ApprovalKind, string> = { discount: 'Discount', generator: 'Generator charges', plan: 'Billing plan', rate: 'Monthly fee', adjust: 'Adjustment' };

type Disc = { kind: 'pct' | 'fixed' | 'none'; value: number; until: string | null };
const num = (x: unknown) => Math.round(Number(x) || 0);

function discText(x: { kind: string; value: number; until: string | null } | null) {
  if (!x || x.kind === 'none' || !x.value) return 'No discount';
  return `${x.kind === 'pct' ? `${x.value}% off the monthly fee` : `${rs(x.value)} off each bill`}${x.until ? ` until ${fd(x.until)}` : ''}`;
}
/** The flat's monthly fee from its next unbilled month, as it is and as it would be with `patch`. */
function feeNow(o: Owner, patch: Partial<Owner> = {}) { const p = nextPeriodFor(o); return { p, fee: rateOf({ ...o, ...patch } as Owner, billDateOf(p)) }; }

/** What the change would do ("10% off the monthly fee") and how it is now ("No discount"). */
export function describe(o: Owner, kind: ApprovalKind, c: Record<string, unknown>): { summary: string; before: string } {
  switch (kind) {
    case 'discount': return { summary: discText(c as unknown as Disc), before: discText(o.discount) };
    case 'generator': {
      const on = !!c.on, a = feeNow(o), b = feeNow(o, { generator: on });
      return { summary: `${on ? 'Add to' : 'Remove from'} the Generator Charges List: ${rs(b.fee)} a month from the ${fm(b.p)} bill`,
        before: `${o.generator ? 'On' : 'Not on'} the list, ${rs(a.fee)} a month` };
    }
    case 'plan': return { summary: `${PLAN_LABEL[c.plan as Plan]} billing`, before: `${PLAN_LABEL[o.plan || 'monthly']} billing` };
    case 'rate': {
      const r = num(c.rate) || null, a = feeNow(o), card = cardRate(o, billDateOf(a.p));
      return { summary: r ? `Own monthly fee of ${rs(r)} from the ${fm(a.p)} bill` : `Back to the rate card, ${rs(card)} a month from the ${fm(a.p)} bill`,
        before: o.rate ? `Own monthly fee of ${rs(o.rate)}` : `Rate card, ${rs(card)} a month` };
    }
    case 'adjust': {
      const amt = num(c.amount), why = String(c.reason || '');
      return { summary: c.kind === 'credit' ? `${rs(amt)} credit or waiver: ${why}` : `${rs(amt)} charge on the next bill: ${why}`, before: `Owes ${rs(Math.max(0, balance(o)))}` };
    }
  }
}

/** Whether the change would leave the flat as it is (nothing to ask for). */
function noChange(o: Owner, kind: ApprovalKind, c: Record<string, unknown>) {
  if (kind === 'discount') { const d = c as unknown as Disc, x = o.discount; return (d.kind === 'none' || !d.value) ? !x || !x.value : !!x && x.kind === d.kind && x.value === d.value && (x.until || null) === (d.until || null); }
  if (kind === 'generator') return !!o.generator === !!c.on;
  if (kind === 'plan') return (o.plan || 'monthly') === c.plan;
  if (kind === 'rate') return (o.rate || null) === (num(c.rate) || null);
  return false;
}
function check(o: Owner, kind: ApprovalKind, c: Record<string, unknown>) {
  if (!o || o.status !== 'active') throw new Error('This apartment has no current owner.');
  if (kind === 'discount' && c.kind === 'pct' && num(c.value) > 100) throw new Error('A percentage discount can be at most 100');
  if (kind === 'generator' && !hasGenerator()) throw new Error(`${cur().proj.name} has no generator rate card.`);
  if (kind === 'plan' && !['monthly', 'quarterly', 'annual'].includes(String(c.plan))) throw new Error('Pick a billing plan');
  if (kind === 'adjust' && (!(num(c.amount) > 0) || !String(c.reason || '').trim())) throw new Error('Enter an amount and the reason');
}

/** Make the change now and record it. `who` is who made it (with who asked for it, when approved). */
export function applyChange(o: Owner, kind: ApprovalKind, c: Record<string, unknown>, who: string): string {
  const S = cur(), d = S.today, t = at(15);
  switch (kind) {
    case 'discount': {
      const x = c as unknown as Disc;
      if (x.kind === 'none' || !x.value) { o.discount = null; log(d, t, 'admin', `Discount removed for ${o.apt} by ${who}`, o.id); return 'Discount removed'; }
      o.discount = { kind: x.kind, value: num(x.value), until: x.until || null };
      log(d, t, 'admin', `Discount set for ${o.apt}: ${x.kind === 'pct' ? x.value + '%' : rs(num(x.value))}${x.until ? ' until ' + fd(x.until) : ''} by ${who}`, o.id);
      return 'Discount saved';
    }
    case 'generator': {
      const on = !!c.on; o.generator = on;
      const { p, fee } = feeNow(o);
      const text = `${on ? 'Added to' : 'Removed from'} the Generator Charges List by ${who}: ${rs(fee)} a month from the ${fm(p)} bill${o.rate ? ` (the flat's own rate of ${rs(o.rate)} still applies)` : ''}. Bills already made don't change.`;
      o.notes.push({ d, by: who, text });
      log(d, t, 'admin', `${o.apt}: ${text}`, o.id);
      return on ? 'Added to the Generator Charges List; it counts from the next bill' : 'Removed from the Generator Charges List; it counts from the next bill';
    }
    case 'plan': {
      const was = o.plan || 'monthly', plan = c.plan as Plan; o.plan = plan;
      log(d, t, 'admin', `${o.apt} billing plan changed by ${who}: ${PLAN_LABEL[was]} → ${PLAN_LABEL[plan]}`, o.id);
      return `Billing plan changed to ${PLAN_LABEL[plan].toLowerCase()}`;
    }
    case 'rate': {
      const r = num(c.rate) || null, was = o.rate; o.rate = r;
      const { p, fee } = feeNow(o);
      const text = `Monthly fee changed by ${who}: ${was ? `own fee ${rs(was)}` : 'rate card'} → ${r ? `own fee ${rs(r)}` : `rate card (${rs(fee)})`}, from the ${fm(p)} bill. Bills already made don't change.`;
      o.notes.push({ d, by: who, text });
      log(d, t, 'admin', `${o.apt}: ${text}`, o.id);
      return `Monthly fee set to ${rs(fee)} from the ${fm(p)} bill`;
    }
    case 'adjust': {
      const amt = num(c.amount), why = String(c.reason || '');
      if (c.kind === 'credit') { waive(o, amt, why, d, t, who); return `${rs(amt)} credited`; }
      S.charges.push({ id: 'CH' + nid('ch'), ownerId: o.id, project: S.project, period: d.slice(0, 7), kind: 'Adjustment', amount: amt, units: null, note: why, by: who, d, billId: null });
      log(d, t, 'admin', `${rs(amt)} charge added to ${o.apt} by ${who} (${why}); goes on the next bill`, o.id);
      return `${rs(amt)} charge added; it goes on the next bill`;
    }
  }
}

/** Ask an admin for the change. An earlier request of the same kind for this flat that is still waiting is replaced. */
export function requestChange(o: Owner, kind: ApprovalKind, c: Record<string, unknown>, note = ''): Approval {
  const S = cur(), t = at(15), who = S.staffName || S.by, { summary, before } = describe(o, kind, c);
  if (kind !== 'adjust') for (const a of S.approvals) if (a.ownerId === o.id && a.kind === kind && a.status === 'pending') {
    a.status = 'withdrawn'; a.decidedById = S.staffId || null; a.decidedByName = who; a.decidedD = S.today; a.decidedT = t; a.reply = 'Replaced by a newer request';
  }
  const a: Approval = { id: 'AP-' + nid('ap'), project: S.project, ownerId: o.id, kind, change: c, summary, before, note: note.trim(),
    byId: S.staffId || null, byName: who, d: S.today, t, status: 'pending', decidedById: null, decidedByName: null, decidedD: null, decidedT: null, reply: null };
  S.approvals.push(a);
  log(S.today, t, 'approval', `${who} asked for a change to ${o.apt} (${KIND_LABEL[kind].toLowerCase()}): ${summary}. Now: ${before}. Waiting for an admin's approval`, o.id);
  return a;
}

export type ChangeResult = { done: 'applied' | 'requested' | 'same'; text: string; summary: string };
/** An admin's change applies now; an accountant's goes to the admins for approval. */
export function changeOrRequest(o: Owner, kind: ApprovalKind, c: Record<string, unknown>, note = ''): ChangeResult {
  check(o, kind, c);
  const S = cur(), { summary } = describe(o, kind, c);
  if (noChange(o, kind, c)) return { done: 'same', text: 'No change', summary };
  if (S.role === 'admin') return { done: 'applied', text: applyChange(o, kind, c, S.staffName || S.by), summary };
  requestChange(o, kind, c, note);
  return { done: 'requested', text: `Sent to an admin for approval: ${summary}. It applies once approved.`, summary };
}

/** An admin approves (the change is made now) or rejects a request. */
export function decide(id: string, approve: boolean, reply = ''): { ok: boolean; text: string } {
  const S = cur(), a = S.approvals.find(x => x.id === id), t = at(15), admin = S.staffName || S.by;
  if (!a) return { ok: false, text: 'That request was not found' };
  if (a.status !== 'pending') return { ok: false, text: `That request was already ${a.status === 'withdrawn' ? 'withdrawn' : a.status}${a.decidedByName ? ' by ' + a.decidedByName : ''}` };
  const o = ownerById(a.ownerId);
  let text: string;
  if (approve) {
    check(o, a.kind, a.change);
    text = noChange(o, a.kind, a.change) ? 'Approved; the apartment already had this, so nothing changed' : applyChange(o, a.kind, a.change, `${admin}, as asked by ${a.byName}`);
  } else text = 'Request rejected; nothing changed';
  Object.assign(a, { status: approve ? 'approved' : 'rejected', decidedById: S.staffId || null, decidedByName: admin, decidedD: S.today, decidedT: t, reply: reply.trim() || null });
  log(S.today, t, 'approval', `${admin} ${approve ? 'approved' : 'rejected'} ${a.byName}'s request for ${o?.apt || 'an apartment'} (${KIND_LABEL[a.kind].toLowerCase()}): ${a.summary}${reply.trim() ? `. Reply: ${reply.trim()}` : ''}`, a.ownerId);
  return { ok: true, text: `${approve ? 'Approved' : 'Rejected'}: ${o?.apt || ''}. ${text}` };
}

/** The person who asked withdraws a request that is still waiting. */
export function withdraw(id: string, staffId: string | null, admin: boolean): { ok: boolean; text: string } {
  const S = cur(), a = S.approvals.find(x => x.id === id);
  if (!a || a.status !== 'pending') return { ok: false, text: 'That request is no longer waiting' };
  if (!admin && a.byId !== staffId) return { ok: false, text: 'Only the person who asked can withdraw it' };
  const t = at(15), who = S.staffName || S.by, o = ownerById(a.ownerId);
  Object.assign(a, { status: 'withdrawn', decidedById: S.staffId || null, decidedByName: who, decidedD: S.today, decidedT: t, reply: null });
  log(S.today, t, 'approval', `${who} withdrew the request for ${o?.apt || 'an apartment'} (${KIND_LABEL[a.kind].toLowerCase()}): ${a.summary}`, a.ownerId);
  return { ok: true, text: 'Request withdrawn' };
}

export const pendingFor = (o: Owner) => cur().approvals.filter(a => a.ownerId === o.id && a.status === 'pending');
