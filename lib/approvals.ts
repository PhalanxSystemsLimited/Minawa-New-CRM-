// Changes an accountant makes that affect what owners are charged or are told, approved by an admin first.
// For one owner: discount, Generator Charges List, billing plan, the flat's own monthly fee and adjustments (extra
// charges, credits or waivers). For the whole project: the monthly fees (rate card), the billing schedule, the fine and
// mass announcements. An admin's change applies at once. An accountant's waits as an approval request (one per owner)
// on the admin's Approvals page, with the accountant's reason (required), and applies only when an admin approves it.
// Everything here runs inside the engine (lib/ops.mutate → use), on the project being changed.
import type { Owner, Approval, ApprovalKind, Plan, Rules } from './types';
import { PLAN_LABEL } from './types';
import { cur, log, at, nid, ownerById, balance, nextPeriodFor, rateOf, cardRate, billDateOf, hasGenerator, waive, rateTypes, rateFor, resyncFines,
  sendPaymentLink, pushMsg } from './engine';
import { fd, fm, rs, ord } from './fmt';

export const KIND_LABEL: Record<ApprovalKind, string> = { discount: 'Discount', generator: 'Generator charges', plan: 'Billing plan', rate: 'Monthly fee', adjust: 'Adjustment',
  rates: 'Monthly fees', rules: 'Billing schedule', fine: 'Fine', announce: 'Announcement' };
/** Changes for the whole project (not one owner). */
export const PROJECT_KINDS: ApprovalKind[] = ['rates', 'rules', 'fine', 'announce'];
export const isProjectKind = (k: ApprovalKind) => PROJECT_KINDS.includes(k);

type Disc = { kind: 'pct' | 'fixed' | 'none'; value: number; until: string | null };
type RulesChange = Pick<Rules, 'billDay' | 'dueDays' | 'remindOn' | 'flagDays' | 'utilities'>;
const num = (x: unknown) => Math.round(Number(x) || 0);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function discText(x: { kind: string; value: number; until: string | null } | null) {
  if (!x || x.kind === 'none' || !x.value) return 'No discount';
  return `${x.kind === 'pct' ? `${x.value}% off the monthly fee` : `${rs(x.value)} off each bill`}${x.until ? ` until ${fd(x.until)}` : ''}`;
}
/** The flat's monthly fee from its next unbilled month, as it is and as it would be with `patch`. */
function feeNow(o: Owner, patch: Partial<Owner> = {}) { const p = nextPeriodFor(o); return { p, fee: rateOf({ ...o, ...patch } as Owner, billDateOf(p)) }; }

/* ---------- whole project ---------- */
function ratesOf(c: Record<string, unknown>) { return Object.entries((c.rates || {}) as Record<string, number>).map(([ty, v]) => [ty, num(v)] as [string, number]).filter(([, v]) => v > 0); }
function rulesDiff(c: RulesChange) {
  const r = cur().settings.rules, out: [string, string][] = [];
  if (c.billDay !== r.billDay) out.push([`bills on the ${ord(r.billDay)}`, `bills on the ${ord(c.billDay)}`]);
  if (c.dueDays !== r.dueDays) out.push([`due ${r.dueDays} days after the bill`, `due ${c.dueDays} days after the bill`]);
  if (c.remindOn.join(',') !== r.remindOn.join(',')) out.push([`reminders on the ${r.remindOn.map(ord).join(' and ') || 'none'}`, `reminders on the ${c.remindOn.map(ord).join(' and ') || 'none'}`]);
  if (c.flagDays !== r.flagDays) out.push([`flag ${r.flagDays} days after the due date`, `flag ${c.flagDays} days after the due date`]);
  if (c.utilities.join(',') !== r.utilities.join(',')) out.push([`utilities: ${r.utilities.join(', ') || 'none'}`, `utilities: ${c.utilities.join(', ') || 'none'}`]);
  return out;
}
const lateOwners = () => cur().owners.filter(o => o.status === 'active' && !o.exempt && o.feeDue > 0 && balance(o) > 0);
function audience(aud: string) {
  const list = cur().owners.filter(x => x.status === 'active' && (aud === 'all' || x.block === aud));
  return { list, label: `${aud === 'all' ? 'all owners' : `Block ${aud}`} (${list.length})` };
}

/** What the change would do ("10% off the monthly fee") and how it is now ("No discount"). */
export function describe(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>): { summary: string; before: string } {
  const S = cur();
  switch (kind) {
    case 'rates': {
      const from = String(c.from), list = ratesOf(c), ch = list.filter(([ty, v]) => v !== rateFor(ty, from));
      return { summary: `Monthly fees from ${fd(from)}: ${(ch.length ? ch : list).map(([ty, v]) => `${ty} ${rs(v)}`).join(', ')}`,
        before: (ch.length ? ch : list).map(([ty]) => `${ty} ${rateFor(ty, from) ? rs(rateFor(ty, from)) : 'no rate'}`).join(', ') };
    }
    case 'rules': { const d = rulesDiff(c as unknown as RulesChange); return { summary: `Billing schedule: ${d.map(x => x[1]).join('; ') || 'no change'}`, before: d.map(x => x[0]).join('; ') || 'the same' }; }
    case 'fine': {
      const r = S.settings.rules, n = lateOwners().length;
      return { summary: `Fine ${num(Number(c.feePct) * 10) / 10}%${c.fineArrears !== r.fineArrears ? (c.fineArrears ? ', old arrears fined too' : ', old arrears not fined') : ''}${c.apply ? `, applied now to the ${plural(n, 'late owner')}${c.send ? ' and sent them their new dues' : ''}` : ', for new overdue dues only'}`,
        before: `Fine ${r.feePct}%${r.fineArrears ? ', old arrears fined too' : ''}` };
    }
    case 'announce': { const a = audience(String(c.aud || 'all')), t = String(c.text || ''); return { summary: `Announcement on WhatsApp to ${a.label}: “${t.length > 160 ? t.slice(0, 160) + '…' : t}”`, before: 'Not sent' }; }
  }
  if (!o) return { summary: '', before: '' };
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
    default: {
      const amt = num(c.amount), why = String(c.reason || '');
      return { summary: c.kind === 'credit' ? `${rs(amt)} credit or waiver: ${why}` : `${rs(amt)} charge on the next bill: ${why}`, before: `Owes ${rs(Math.max(0, balance(o)))}` };
    }
  }
}

/** Whether the change would leave things as they are (nothing to ask for). */
function noChange(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>) {
  const r = cur().settings.rules;
  if (kind === 'rates') { const from = String(c.from); return ratesOf(c).every(([ty, v]) => cur().rates.some(x => x.type === ty && x.from === from && x.amount === v) || (v === rateFor(ty, from) && rateFor(ty, from) > 0)); }
  if (kind === 'rules') return !rulesDiff(c as unknown as RulesChange).length;
  if (kind === 'fine') return num(Number(c.feePct) * 10) === num(r.feePct * 10) && !!c.fineArrears === !!r.fineArrears && !c.apply;
  if (kind === 'announce') return false;
  if (!o) return false;
  if (kind === 'discount') { const d = c as unknown as Disc, x = o.discount; return (d.kind === 'none' || !d.value) ? !x || !x.value : !!x && x.kind === d.kind && x.value === d.value && (x.until || null) === (d.until || null); }
  if (kind === 'generator') return !!o.generator === !!c.on;
  if (kind === 'plan') return (o.plan || 'monthly') === c.plan;
  if (kind === 'rate') return (o.rate || null) === (num(c.rate) || null);
  return false;
}
function check(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>) {
  if (isProjectKind(kind)) {
    if (kind === 'rates' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.from)) || !ratesOf(c).length)) throw new Error('Pick the date the new rates start and enter the rates');
    if (kind === 'fine' && !(Number(c.feePct) >= 0 && Number(c.feePct) <= 50)) throw new Error('The fine must be between 0% and 50%');
    if (kind === 'announce' && !String(c.text || '').trim()) throw new Error('Write the message first');
    return;
  }
  if (!o || o.status !== 'active') throw new Error('This apartment has no current owner.');
  if (kind === 'discount' && c.kind === 'pct' && num(c.value) > 100) throw new Error('A percentage discount can be at most 100');
  if (kind === 'generator' && !hasGenerator()) throw new Error(`${cur().proj.name} has no generator rate card.`);
  if (kind === 'plan' && !['monthly', 'quarterly', 'annual'].includes(String(c.plan))) throw new Error('Pick a billing plan');
  if (kind === 'adjust' && (!(num(c.amount) > 0) || !String(c.reason || '').trim())) throw new Error('Enter an amount and the reason');
}

/** Make the change now and record it. `who` is who made it (with who asked for it, when approved). */
export function applyChange(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>, who: string): string {
  const S = cur(), d = S.today, t = at(15);
  switch (kind) {
    case 'rates': {
      const from = String(c.from);
      for (const [ty, v] of ratesOf(c)) { const x = S.rates.find(r => r.type === ty && r.from === from); if (x) x.amount = v; else S.rates.push({ id: `${S.project}:${ty}:${from}`, project: S.project, type: ty, from, amount: v }); }
      log(d, t, 'admin', `Rates from ${fd(from)} saved by ${who}: ${S.rates.filter(r => r.from === from).map(r => r.type + ' ' + rs(r.amount)).join(', ')}`);
      return `Rates from ${fd(from)} saved`;
    }
    case 'rules': {
      const next = { ...S.settings.rules, ...(c as unknown as RulesChange) };
      S.settings.rules = next;
      log(d, t, 'admin', `Billing schedule changed by ${who}: bills on the ${ord(next.billDay)}, due ${next.dueDays} days later, reminders on the ${next.remindOn.map(ord).join(' and ') || 'none'}, flag ${next.flagDays} days after the due date, utilities: ${next.utilities.join(', ') || 'none'}. New bills use them.`);
      return 'Billing schedule saved. It applies to new bills.';
    }
    case 'fine': {
      const was = S.settings.rules.feePct, wasA = S.settings.rules.fineArrears, pct = num(Number(c.feePct) * 10) / 10, arrears = !!c.fineArrears;
      S.settings.rules = { ...S.settings.rules, feePct: pct, fineArrears: arrears };
      log(d, t, 'fine', `Fine changed from ${was}% to ${pct}% by ${who}${wasA !== arrears ? (arrears ? '; old arrears are now fined too' : '; old arrears are no longer fined') : ''}${c.apply ? ', applied to current late owners' : ', for new overdue dues'}`);
      if (!c.apply) return `Fine set to ${pct}% for new overdue dues`;
      const changed = resyncFines(d, t, who);
      if (c.send) changed.forEach(x => { if (balance(x) > 0) sendPaymentLink(x, d, t); });
      return `Fine set to ${pct}%. ${plural(changed.length, 'late owner')} updated${c.send ? ' and sent their new dues' : ''}.`;
    }
    case 'announce': {
      const text = String(c.text), aud = String(c.aud || 'all'), { list } = audience(aud);
      let failed = 0;
      list.forEach(x => { const m = pushMsg(x, d, t, { kind: 'announcement', title: 'Announcement', text, tpl: 'announce', vars: { text }, manual: true }); if (m.status === 'failed') failed++; });
      log(d, t, 'message', `Announcement sent to ${list.length} owners (${aud === 'all' ? 'all blocks' : 'Block ' + aud})${failed ? `, ${failed} failed` : ''} by ${who}`);
      return `Announcement to ${list.length} owners${failed ? `, ${failed} without a WhatsApp number` : ''}. It waits in Send on WhatsApp`;
    }
  }
  if (!o) throw new Error('Apartment not found');
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
    default: {
      const amt = num(c.amount), why = String(c.reason || '');
      if (c.kind === 'credit') { waive(o, amt, why, d, t, who); return `${rs(amt)} credited`; }
      S.charges.push({ id: 'CH' + nid('ch'), ownerId: o.id, project: S.project, period: d.slice(0, 7), kind: 'Adjustment', amount: amt, units: null, note: why, by: who, d, billId: null });
      log(d, t, 'admin', `${rs(amt)} charge added to ${o.apt} by ${who} (${why}); goes on the next bill`, o.id);
      return `${rs(amt)} charge added; it goes on the next bill`;
    }
  }
}

const what = (o: Owner | null) => o ? o.apt : 'the whole project';

/** Ask an admin for the change. An earlier request of the same kind (same flat, or the project) still waiting is replaced. */
export function requestChange(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>, note = ''): Approval {
  const S = cur(), t = at(15), who = S.staffName || S.by, { summary, before } = describe(o, kind, c), ownerId = o ? o.id : null;
  if (kind !== 'adjust' && kind !== 'announce') for (const a of S.approvals) if (a.ownerId === ownerId && a.kind === kind && a.status === 'pending') {
    a.status = 'withdrawn'; a.decidedById = S.staffId || null; a.decidedByName = who; a.decidedD = S.today; a.decidedT = t; a.reply = 'Replaced by a newer request';
  }
  const a: Approval = { id: 'AP-' + nid('ap'), project: S.project, ownerId, kind, change: c, summary, before, note: note.trim(),
    byId: S.staffId || null, byName: who, d: S.today, t, status: 'pending', decidedById: null, decidedByName: null, decidedD: null, decidedT: null, reply: null };
  S.approvals.push(a);
  log(S.today, t, 'approval', `${who} asked for a change to ${what(o)} (${KIND_LABEL[kind].toLowerCase()}): ${summary}. Now: ${before}. Reason: ${a.note}. Waiting for an admin's approval`, ownerId);
  return a;
}

export type ChangeResult = { done: 'applied' | 'requested' | 'same'; text: string; summary: string };
/** An admin's change applies now; an accountant's goes to the admins for approval, with a reason (required). */
export function changeOrRequest(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>, note = ''): ChangeResult {
  check(o, kind, c);
  const S = cur(), { summary } = describe(o, kind, c);
  if (noChange(o, kind, c)) return { done: 'same', text: 'No change', summary };
  if (S.role === 'admin') return { done: 'applied', text: applyChange(o, kind, c, S.staffName || S.by), summary };
  if (!note.trim()) throw new Error('Write the reason for this change. The admin sees it before approving.');
  requestChange(o, kind, c, note);
  return { done: 'requested', text: `Sent to an admin for approval: ${summary}. It applies once approved.`, summary };
}

/** An admin approves (the change is made now) or rejects a request (the note is optional). */
export function decide(id: string, approve: boolean, reply = ''): { ok: boolean; text: string } {
  const S = cur(), a = S.approvals.find(x => x.id === id), t = at(15), admin = S.staffName || S.by;
  if (!a) return { ok: false, text: 'That request was not found' };
  if (a.status !== 'pending') return { ok: false, text: `That request was already ${a.status === 'withdrawn' ? 'withdrawn' : a.status}${a.decidedByName ? ' by ' + a.decidedByName : ''}` };
  const o = a.ownerId ? ownerById(a.ownerId) : null;
  let text: string;
  if (approve) {
    check(o, a.kind, a.change);
    text = noChange(o, a.kind, a.change) ? 'Approved; this was already in place, so nothing changed' : applyChange(o, a.kind, a.change, `${admin}, as asked by ${a.byName}`);
  } else text = 'Request rejected; nothing changed';
  Object.assign(a, { status: approve ? 'approved' : 'rejected', decidedById: S.staffId || null, decidedByName: admin, decidedD: S.today, decidedT: t, reply: reply.trim() || null });
  log(S.today, t, 'approval', `${admin} ${approve ? 'approved' : 'rejected'} ${a.byName}'s request for ${a.ownerId ? o?.apt || 'an apartment' : 'the whole project'} (${KIND_LABEL[a.kind].toLowerCase()}): ${a.summary}${reply.trim() ? `. Note: ${reply.trim()}` : ''}`, a.ownerId);
  return { ok: true, text: `${approve ? 'Approved' : 'Rejected'}${o ? ': ' + o.apt : ''}. ${text}` };
}

/** The person who asked withdraws a request that is still waiting. */
export function withdraw(id: string, staffId: string | null, admin: boolean): { ok: boolean; text: string } {
  const S = cur(), a = S.approvals.find(x => x.id === id);
  if (!a || a.status !== 'pending') return { ok: false, text: 'That request is no longer waiting' };
  if (!admin && a.byId !== staffId) return { ok: false, text: 'Only the person who asked can withdraw it' };
  const t = at(15), who = S.staffName || S.by, o = a.ownerId ? ownerById(a.ownerId) : null;
  Object.assign(a, { status: 'withdrawn', decidedById: S.staffId || null, decidedByName: who, decidedD: S.today, decidedT: t, reply: null });
  log(S.today, t, 'approval', `${who} withdrew the request for ${a.ownerId ? o?.apt || 'an apartment' : 'the whole project'} (${KIND_LABEL[a.kind].toLowerCase()}): ${a.summary}`, a.ownerId);
  return { ok: true, text: 'Request withdrawn' };
}

export const pendingFor = (o: Owner) => cur().approvals.filter(a => a.ownerId === o.id && a.status === 'pending');
/** Project-wide changes waiting for approval (Settings). */
export const pendingProject = () => cur().approvals.filter(a => !a.ownerId && a.status === 'pending');
