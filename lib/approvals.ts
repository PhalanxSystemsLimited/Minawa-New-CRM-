// Changes an accountant makes that affect what owners are charged or are told, approved by an admin first.
// For one owner: discount, Generator Charges List, billing plan, the flat's own monthly fee and adjustments (extra
// charges, credits or waivers). For the whole project: the monthly fees (rate card), the billing schedule, the fine and
// mass announcements. An admin's change applies at once. An accountant's waits as an approval request (one per owner)
// on the admin's Approvals page, with the accountant's reason (required), and applies only when an admin approves it.
// Everything here runs inside the engine (lib/ops.mutate → use), on the project being changed.
import type { Owner, Approval, ApprovalKind, Plan, Rules } from './types';
import { PLAN_LABEL } from './types';
import { blankOwner } from './seed';
import { normPhone } from './importer';
import { cur, log, at, nid, ownerById, balance, nextPeriodFor, rateOf, cardRate, billDateOf, hasGenerator, waive, rateTypes, rateFor, resyncFines,
  sendDues, pushMsg, nextBillFor, anchorOf, reversePayment, correctCurrentBill, dueDayOf, leaveFigures, finalizeLeave, unitOf } from './engine';
import { fd, fm, rs, ord, addDays, diff } from './fmt';
import { keepCustIds, nextCustId, flatByApt } from './people';

export const KIND_LABEL: Record<ApprovalKind, string> = { discount: 'Discount', generator: 'Generator charges', plan: 'Billing plan', rate: 'Monthly fee', adjust: 'Adjustment',
  rates: 'Monthly fees', rules: 'Billing schedule', fine: 'Fine', announce: 'Announcement', possession: 'New possession', instalments: 'Instalment plan', due: 'Due date', posdate: 'Possession date', reverse: 'Reverse a payment', discontinue: 'Discontinue maintenance', leave: 'Customer left' };
/** Changes for the whole project (not one owner). */
export const PROJECT_KINDS: ApprovalKind[] = ['rates', 'rules', 'fine', 'announce', 'possession'];
export const isProjectKind = (k: ApprovalKind) => PROJECT_KINDS.includes(k);

type Disc = { kind: 'pct' | 'fixed' | 'none'; value: number; until: string | null };
type RulesChange = Pick<Rules, 'billDay' | 'dueDays' | 'remindOn' | 'flagDays' | 'utilities'> & { graceDays?: number; billLead?: number; warnAfter?: number };
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
  if (c.graceDays != null && c.graceDays !== r.graceDays) out.push([`new customers' first bill ${r.graceDays} days after possession`, `${c.graceDays} days after possession`]);
  if (c.billDay !== r.billDay) out.push([`customers with no possession date billed on the ${ord(r.billDay)}`, `on the ${ord(c.billDay)}`]);
  if (c.dueDays !== r.dueDays) out.push([`due on the ${ord(r.dueDays)} of the next month`, `due on the ${ord(c.dueDays)} of the next month`]);
  if (c.remindOn.join(',') !== r.remindOn.join(',')) out.push([`reminders on the ${r.remindOn.map(ord).join(' and ') || 'none'}`, `reminders on the ${c.remindOn.map(ord).join(' and ') || 'none'}`]);
  if (c.flagDays !== r.flagDays) out.push([`flag ${r.flagDays} days after the due date`, `flag ${c.flagDays} days after the due date`]);
  if (c.utilities.join(',') !== r.utilities.join(',')) out.push([`utilities: ${r.utilities.join(', ') || 'none'}`, `utilities: ${c.utilities.join(', ') || 'none'}`]);
  if (c.billLead != null && c.billLead !== r.billLead) out.push([`bill ${r.billLead} days before the due date`, `bill ${c.billLead} days before the due date`]);
  if (c.warnAfter != null && c.warnAfter !== r.warnAfter) out.push([`late warning ${r.warnAfter} days after the due date`, `late warning ${c.warnAfter} days after the due date`]);
  return out;
}
const lateOwners = () => cur().owners.filter(o => o.status === 'active' && !o.exempt && o.feeDue > 0 && balance(o) > 0);
function audience(aud: string) {
  const list = cur().owners.filter(x => x.status === 'active' && (aud === 'all' || x.block === aud));
  return { list, label: `${aud === 'all' ? 'all owners' : `Block ${aud}`} (${list.length})` };
}

/** What the change would do ("10% off the monthly fee") and how it is now ("No discount"). */
export function describe(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>): { summary: string; before: string } {
  const r = describeRaw(o, kind, c);
  return c.apply === 'current' ? { ...r, summary: `${r.summary} · applies to the current bill` } : c.apply === 'next' ? { ...r, summary: `${r.summary} · from the next bill` } : r;
}
function describeRaw(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>): { summary: string; before: string } {
  const S = cur();
  switch (kind) {
    case 'rates': {
      const from = String(c.from), list = ratesOf(c), ch = list.filter(([ty, v]) => v !== rateFor(ty, from));
      return { summary: `Monthly fees from ${fd(from)}: ${(ch.length ? ch : list).map(([ty, v]) => `${ty} ${rs(v)}`).join(', ')}`,
        before: (ch.length ? ch : list).map(([ty]) => `${ty} ${rateFor(ty, from) ? rs(rateFor(ty, from)) : 'no rate'}`).join(', ') };
    }
    case 'possession': return { summary: `New possession: ${String(c.apt)} (${String(c.type)}) to ${String(c.name)}${c.cnic ? ` (CNIC ${String(c.cnic)}${c.cnicExpiry ? `, expires ${fd(String(c.cnicExpiry))}` : ''})` : ''} on ${fd(String(c.possession))}, ${PLAN_LABEL[(c.plan as Plan) || 'monthly'].toLowerCase()} billing`, before: 'Not possessed: not billed' };
    case 'instalments': { const it = (c.items || []) as { amount: number; due: string }[], tot = it.reduce((a, x) => a + num(x.amount), 0);
      return { summary: `Old arrears of ${rs(tot)} in ${plural(it.length, 'instalment')}: ${it.map(x => `${rs(num(x.amount))} by ${fd(x.due)}`).join(', ')}`,
        before: o ? (o.instalments ? `A plan of ${plural(o.instalments.items.length, 'instalment')} (${rs(o.instalments.total)})` : `${rs(o.openingLeft || 0)} old arrears, due in full`) : '' }; }
    case 'leave': { const L = String(c.date), f = o ? leaveFigures(o, L) : null;
      return { summary: `${o?.name} leaves ${o?.apt} on ${fd(L)}${c.reading != null && c.reading !== '' ? `, meter ${c.reading}` : ''}: all charges cleared${f && f.due < 0 ? ` (${rs(-f.due)} to refund)` : ''}; the apartment becomes vacant`, before: `In possession since ${o?.possessionKnown ? fd(o.possession) : 'before the office list'}` }; }
    case 'discontinue': return c.on
      ? { summary: `Discontinue maintenance for ${o?.apt}: ${rs(Math.max(0, o ? balance(o) : 0))} unpaid after the late warning`, before: o?.flagged ? 'Already discontinued' : 'Maintenance running' }
      : { summary: `Resume maintenance for ${o?.apt}`, before: o?.flagged ? `Discontinued${o.flaggedOn ? ` since ${fd(o.flaggedOn)}` : ''}` : 'Maintenance running' };
    case 'reverse': { const p = cur().payments.find(x => x.id === String(c.pid));
      return { summary: `Reverse payment ${p ? `${p.receipt} of ${rs(p.amount)} (${fd(p.d)})` : String(c.pid)}: ${String(c.reason || '')}`, before: p ? `Counted: ${rs(p.amount)} cash, receipt ${p.receipt}` : 'Payment not found' }; }
    case 'posdate': { const pd = String(c.possession);
      return { summary: `Possession date ${fd(pd)}: due on the ${ord(+pd.slice(8))} from the next bill`, before: o ? (o.possessionKnown ? `Possession ${fd(o.possession)}, due on the ${ord(dueDayOf(o))}` : 'No possession date on file, due on the 1st') : '' }; }
    case 'due': return { summary: `Due on the ${ord(num(c.dueDay))} of the month after each bill`, before: o?.dueDay ? `Due on the ${ord(o.dueDay)}` : 'The project\'s due date' };
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
  if (kind === 'announce' || kind === 'possession' || kind === 'instalments') return false;
  if (!o) return false;
  if (kind === 'due') return (o.dueDay || null) === (num(c.dueDay) || null);
  if (kind === 'reverse') return !cur().payments.some(x => x.id === String(c.pid));
  if (kind === 'discontinue') return !!o.flagged === !!c.on;
  if (kind === 'leave') return o.status === 'closed';
  if (kind === 'posdate') return o.possessionKnown && o.possession === String(c.possession);
  if (kind === 'discount') { const d = c as unknown as Disc, x = o.discount; return (d.kind === 'none' || !d.value) ? !x || !x.value : !!x && x.kind === d.kind && x.value === d.value && (x.until || null) === (d.until || null); }
  if (kind === 'generator') return !!o.generator === !!c.on;
  if (kind === 'plan') return (o.plan || 'monthly') === c.plan;
  if (kind === 'rate') return (o.rate || null) === (num(c.rate) || null);
  return false;
}
function check(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>) {
  if (kind === 'leave' && o) {
    const L = String(c.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(L) || L > cur().today) throw new Error('Pick the day the customer left (today or earlier)');
    if (o.possessionKnown && L < o.possession) throw new Error('The leaving date is before the possession date');
    const f = leaveFigures(o, L);
    if (f.due > 0) throw new Error(`Charges are not cleared. Please clear all charges first: ${rs(f.due)} still to pay.`);
  }
  if (kind === 'discontinue' && c.on && o && balance(o) <= 0) throw new Error('Nothing is owed, so maintenance can\'t be discontinued');
  if (kind === 'reverse') { const p = cur().payments.find(x => x.id === String(c.pid)); if (!p || (o && p.ownerId !== o.id)) throw new Error('That payment was not found'); if (!String(c.reason || '').trim()) throw new Error('Write why this payment is wrong'); }
  if (isProjectKind(kind)) {
    if (kind === 'rates' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.from)) || !ratesOf(c).length)) throw new Error('Pick the date the new rates start and enter the rates');
    if (kind === 'fine' && !(Number(c.feePct) >= 0 && Number(c.feePct) <= 50)) throw new Error('The fine must be between 0% and 50%');
    if (kind === 'announce' && !String(c.text || '').trim()) throw new Error('Write the message first');
    if (kind === 'possession') checkPossession(c);
    return;
  }
  if (!o || o.status !== 'active') throw new Error('This apartment has no current owner.');
  if (kind === 'discount' && c.kind === 'pct' && num(c.value) > 100) throw new Error('A percentage discount can be at most 100');
  if (kind === 'generator' && !hasGenerator()) throw new Error(`${cur().proj.name} has no generator rate card.`);
  if (kind === 'plan' && !['monthly', 'quarterly', 'sixmonthly', 'annual'].includes(String(c.plan))) throw new Error('Pick a billing plan');
  if (kind === 'adjust' && (!(num(c.amount) > 0) || !String(c.reason || '').trim())) throw new Error('Enter an amount and the reason');
  if (kind === 'posdate' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.possession)) || String(c.possession) > cur().today)) throw new Error('The possession date must be a real date, not in the future');
  if (kind === 'due' && !(num(c.dueDay) >= 1 && num(c.dueDay) <= 28)) throw new Error('Pick a due day between the 1st and the 28th');
  if (kind === 'instalments') {
    const it = (c.items || []) as { amount: number; due: string }[], tot = it.reduce((a, x) => a + num(x.amount), 0), today = cur().today;
    if (!(o.openingLeft > 0)) throw new Error(`${o.apt} has no old arrears to split.`);
    if (it.length < 2 || it.length > 24) throw new Error('An instalment plan has 2 to 24 instalments');
    if (it.some(x => !(num(x.amount) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.due)))) throw new Error('Every instalment needs an amount and a due date');
    if (it.some((x, i) => i && String(x.due) <= String(it[i - 1].due))) throw new Error('Put the instalments in date order, each due after the one before');
    if (String(it[0].due) < today) throw new Error('The first instalment can\'t be due in the past');
    if (tot !== num(o.openingLeft)) throw new Error(`The instalments add up to ${rs(tot)}; the old arrears are ${rs(o.openingLeft)}. They must match.`);
  }
}
function checkPossession(c: Record<string, unknown>) {
  const apt = String(c.apt || '').toUpperCase();
  if (!apt || !String(c.name || '').trim() || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.possession)) || !c.type) throw new Error('Fill in the apartment, type, owner and possession date');
  if (cur().owners.some(o => o.status === 'active' && o.apt.toUpperCase() === apt)) throw new Error(`${apt} already has an owner. For a sale, use Transfer on that apartment.`);
  // 21 Nov 2026: only a flat of this building (one a customer had, or one the Admin added).
  if (!flatByApt(apt)) throw new Error(`${apt} isn't one of this building's flats. The Admin adds flats in Settings › Flats.`);
  if (!rateTypes().includes(String(c.type))) throw new Error(`${String(c.type)} has no rate yet. An admin adds it in Settings › Monthly fees.`);
}

/** Make the change now and record it. `who` is who made it (with who asked for it, when approved). */
export function applyChange(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>, who: string): string {
  const S = cur(), d = S.today, t = at(15);
  switch (kind) {
    case 'rates': {
      const from = String(c.from);
      for (const [ty, v] of ratesOf(c)) { const x = S.rates.find(r => r.type === ty && r.from === from); if (x) x.amount = v; else S.rates.push({ id: `${S.project}:${ty}:${from}`, project: S.project, type: ty, from, amount: v }); }
      log(d, t, 'admin', `Rates from ${fd(from)} saved by ${who}: ${S.rates.filter(r => r.from === from).map(r => r.type + ' ' + rs(r.amount)).join(', ')}`);
      let n = 0;
      if (c.apply === 'current') for (const o of S.owners) if (o.status === 'active' && !o.exempt && correctCurrentBill(o, `new rates from ${fd(from)}`, d, t, who, from)) n++;
      return `Rates from ${fd(from)} saved${c.apply === 'current' ? `; ${n} current bill${n === 1 ? '' : 's'} corrected` : ''}`;
    }
    case 'rules': {
      const next = { ...S.settings.rules, ...(c as unknown as RulesChange) };
      S.settings.rules = next;
      log(d, t, 'admin', `Billing schedule changed by ${who}: bill ${next.billLead} days before each due date, late warning ${next.warnAfter} days after it; utilities: ${next.utilities.join(', ') || 'none'}`);
      return 'Billing schedule saved. It applies to new bills.';
    }
    case 'fine': {
      const was = S.settings.rules.feePct, wasA = S.settings.rules.fineArrears, pct = num(Number(c.feePct) * 10) / 10, arrears = !!c.fineArrears;
      S.settings.rules = { ...S.settings.rules, feePct: pct, fineArrears: arrears };
      log(d, t, 'fine', `Fine changed from ${was}% to ${pct}% by ${who}${wasA !== arrears ? (arrears ? '; old arrears are now fined too' : '; old arrears are no longer fined') : ''}${c.apply ? ', applied to current late owners' : ', for new overdue dues'}`);
      if (!c.apply) return `Fine set to ${pct}% for new overdue dues`;
      const changed = resyncFines(d, t, who);
      if (c.send) changed.forEach(x => { if (balance(x) > 0) sendDues(x, d, t); });
      return `Fine set to ${pct}%. ${plural(changed.length, 'late owner')} updated${c.send ? ' and sent their new dues' : ''}.`;
    }
    case 'announce': {
      const text = String(c.text), aud = String(c.aud || 'all'), { list } = audience(aud);
      let failed = 0;
      list.forEach(x => { const m = pushMsg(x, d, t, { kind: 'announcement', title: 'Announcement', text, tpl: 'announce', vars: { text }, manual: true }); if (m.status === 'failed') failed++; });
      log(d, t, 'message', `Announcement sent to ${list.length} owners (${aud === 'all' ? 'all blocks' : 'Block ' + aud})${failed ? `, ${failed} failed` : ''} by ${who}`);
      return `Announcement to ${list.length} owners${failed ? `, ${failed} without a WhatsApp number` : ''}. It waits in To do, to send one by one`;
    }
    case 'possession': { const r = addPossession(c, who); return `Possession recorded for ${r.apt}. First bill on ${fd(r.next)}.`; }
  }
  if (!o) throw new Error('Apartment not found');
  switch (kind) {
    case 'discount': {
      const x = c as unknown as Disc;
      if (x.kind === 'none' || !x.value) { o.discount = null; log(d, t, 'admin', `Discount removed for ${o.apt} by ${who}`, o.id); const cb = c.apply === 'current' ? correctCurrentBill(o, 'discount removed', d, t, who) : 0; return `Discount removed${cb ? `; current bill corrected by ${rs(cb)}` : ''}`; }
      o.discount = { kind: x.kind, value: num(x.value), until: x.until || null };
      log(d, t, 'admin', `Discount set for ${o.apt}: ${x.kind === 'pct' ? x.value + '%' : rs(num(x.value))}${x.until ? ' until ' + fd(x.until) : ''} by ${who}`, o.id);
      const cb = c.apply === 'current' ? correctCurrentBill(o, 'discount changed', d, t, who) : 0;
      return `Discount saved${cb ? `; current bill corrected by ${rs(cb)}` : c.apply === 'current' ? '' : ', from the next bill'}`;
    }
    case 'generator': {
      const on = !!c.on; o.generator = on;
      const { p, fee } = feeNow(o);
      const text = `${on ? 'Added to' : 'Removed from'} the Generator Charges List by ${who}: ${rs(fee)} a month from the ${fm(p)} bill${o.rate ? ` (the flat's own rate of ${rs(o.rate)} still applies)` : ''}. Bills already made don't change.`;
      o.notes.push({ d, by: who, text });
      log(d, t, 'admin', `${o.apt}: ${text}`, o.id);
      const cb = c.apply === 'current' ? correctCurrentBill(o, on ? 'generator charges added' : 'generator charges removed', d, t, who) : 0;
      return `${on ? 'Added to' : 'Removed from'} the Generator Charges List; ${c.apply === 'current' ? (cb ? `current bill corrected by ${rs(cb)}` : 'no current bill to correct') : 'it counts from the next bill'}`;
    }
    case 'plan': {
      const was = o.plan || 'monthly', plan = c.plan as Plan; o.plan = plan;
      log(d, t, 'admin', `${o.apt} billing plan changed by ${who}: ${PLAN_LABEL[was]} → ${PLAN_LABEL[plan]}`, o.id);
      return `Billing plan changed to ${PLAN_LABEL[plan].toLowerCase()}`;
    }
    case 'leave': {
      const r = finalizeLeave(o!, String(c.date), c.reading != null && c.reading !== '' ? Number(c.reading) : null, cur().today, at(15), who);
      return `${o!.apt} is vacant: all charges cleared, clearance ${r.clearance}${r.refund ? `; ${rs(r.refund)} advance to refund` : ''}`;
    }
    case 'discontinue': {
      const d = cur().today, t = at(15);
      if (c.on) { o!.flagged = true; o!.flaggedOn = d; log(d, t, 'flag', `Maintenance discontinued for ${o!.apt} (${rs(Math.max(0, balance(o!)))} unpaid), approved by ${who}`, o!.id); return `Maintenance discontinued for ${o!.apt}`; }
      o!.flagged = false; o!.flaggedOn = null; log(d, t, 'flag', `Maintenance resumed for ${o!.apt} by ${who}`, o!.id); return `Maintenance resumed for ${o!.apt}`;
    }
    case 'reverse': {
      const p = S.payments.find(x => x.id === String(c.pid));
      if (!p) throw new Error('That payment is not there any more (already reversed?)');
      reversePayment(o, p, String(c.reason || 'No reason given'), who, d, t);
      return `Payment ${p.receipt} reversed; ${o.apt} owes ${rs(balance(o))} again`;
    }
    case 'posdate': {
      const pd = String(c.possession), was = o.possessionKnown ? fd(o.possession) : 'not on file', wasDay = dueDayOf(o);
      o.possession = pd; o.possessionKnown = true; if (o.firstBill) o.firstBill = addDays(pd, S.settings.rules.graceDays ?? 25);
      const text = `Possession date set by ${who}: ${was} → ${fd(pd)}. Due on the ${ord(dueDayOf(o))} (was the ${ord(wasDay)}) from the next bill; bills already made stay as they are.`;
      o.notes.push({ d, by: who, text }); log(d, t, 'admin', `${o.apt}: ${text}`, o.id);
      return `Possession date saved; due on the ${ord(dueDayOf(o))} from the next bill`;
    }
    case 'due': {
      const dd = num(c.dueDay) || null, was = o.dueDay; o.dueDay = dd;
      const text = `Due date changed by ${who}: ${was ? `the ${ord(was)}` : 'the project\'s rule'} → ${dd ? `the ${ord(dd)} of the month after each bill` : 'the project\'s rule'}, from the next bill. Bills already made keep their due date.`;
      o.notes.push({ d, by: who, text }); log(d, t, 'admin', `${o.apt}: ${text}`, o.id);
      return 'Due date saved; it applies from the next bill';
    }
    case 'instalments': {
      const items = ((c.items || []) as { amount: number; due: string }[]).map(x => ({ amount: num(x.amount), due: String(x.due) })), total = items.reduce((a, x) => a + x.amount, 0);
      o.instalments = { id: 'IP-' + nid('ip'), approvedD: d, startLeft: num(o.openingLeft), total, items, by: who };
      const text = `Instalment plan for old arrears set by ${who}: ${items.map(x => `${rs(x.amount)} by ${fd(x.due)}`).join(', ')}. Monthly bills carry on as usual.`;
      o.notes.push({ d, by: who, text }); log(d, t, 'admin', `${o.apt}: ${text}`, o.id);
      return `Instalment plan of ${plural(items.length, 'instalment')} saved`;
    }
    case 'rate': {
      const r = num(c.rate) || null, was = o.rate; o.rate = r;
      const { p, fee } = feeNow(o);
      const text = `Monthly fee changed by ${who}: ${was ? `own fee ${rs(was)}` : 'rate card'} → ${r ? `own fee ${rs(r)}` : `rate card (${rs(fee)})`}, from the ${fm(p)} bill. Bills already made don't change.`;
      o.notes.push({ d, by: who, text });
      log(d, t, 'admin', `${o.apt}: ${text}`, o.id);
      const cb = c.apply === 'current' ? correctCurrentBill(o, 'monthly fee changed', d, t, who) : 0;
      return `Monthly fee set to ${rs(fee)}${c.apply === 'current' ? (cb ? `; current bill corrected by ${rs(cb)}` : '') : ` from the ${fm(p)} bill`}`;
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

/** Approved changes the Admin can undo (21 Nov 2026): within UNDO_DAYS, while no bill has used them. A change that
 *  corrected the current bill can't be undone this way (the opposite change is made by hand). */
export const UNDO_KINDS: ApprovalKind[] = ['rate', 'rates', 'discount', 'plan'];
export const UNDO_DAYS = 7;
const billsNow = (o: Owner | null, kind: ApprovalKind) => kind === 'rates' || !o ? cur().bills.length : cur().bills.filter(b => b.ownerId === o.id).length;
function before(o: Owner | null, kind: ApprovalKind, c: Record<string, unknown>): Record<string, unknown> | null {
  const S = cur();
  if (kind === 'rates') { const from = String(c.from); return { from, rows: ratesOf(c).map(([type]) => ({ type, amount: S.rates.find(r => r.type === type && r.from === from)?.amount ?? null })) }; }
  if (!o) return null;
  if (kind === 'rate') return { rate: o.rate ?? null };
  if (kind === 'discount') return { discount: o.discount ? { ...o.discount } : null };
  if (kind === 'plan') return { plan: o.plan || 'monthly' };
  return null;
}
/** Why an approval can't be undone now (null when it can). */
export function cantUndo(a: Approval): string | null {
  if (a.status !== 'approved' || !a.undo) return 'This approval can\'t be undone here: make the opposite change by hand.';
  if (a.undo.doneD) return `Already undone on ${fd(a.undo.doneD)}${a.undo.doneBy ? ` by ${a.undo.doneBy}` : ''}.`;
  if (!a.decidedD || diff(cur().today, a.decidedD) > UNDO_DAYS) return `Undo is only possible for ${UNDO_DAYS} days after approving. Make the opposite change by hand.`;
  const o = a.ownerId ? ownerById(a.ownerId) : null;
  if (billsNow(o, a.kind) !== a.undo.bills) return 'A bill has been made since this was approved, so it can\'t be undone. Make the opposite change by hand (it applies from the next bill).';
  if (!noChange(o, a.kind, a.change)) return 'It has been changed again since, so it can\'t be undone. Make the change you want by hand.';
  return null;
}
/** The Admin puts an approved change back the way it was. */
export function undoApproval(id: string): { ok: boolean; text: string } {
  const S = cur(), a = S.approvals.find(x => x.id === id), t = at(15), who = S.staffName || S.by;
  if (!a) return { ok: false, text: 'That approval was not found' };
  const why = cantUndo(a); if (why) return { ok: false, text: why };
  const o = a.ownerId ? ownerById(a.ownerId) : null, p = a.undo!.prev;
  if (a.kind === 'rates') {
    const from = String(p.from);
    for (const r of (p.rows || []) as { type: string; amount: number | null }[]) {
      const i = S.rates.findIndex(x => x.type === r.type && x.from === from);
      if (r.amount == null) { if (i >= 0) S.rates.splice(i, 1); } else if (i >= 0) S.rates[i].amount = r.amount; else S.rates.push({ id: `${S.project}:${r.type}:${from}`, project: S.project, type: r.type, from, amount: r.amount });
    }
  } else if (o && a.kind === 'rate') o.rate = (p.rate as number | null) || null;
  else if (o && a.kind === 'discount') o.discount = (p.discount as Owner['discount']) || null;
  else if (o && a.kind === 'plan') o.plan = (p.plan as Plan) || 'monthly';
  a.undo = { ...a.undo!, doneD: S.today, doneBy: who };
  log(S.today, t, 'approval', `${who} undid the approved change for ${what(o)} (${KIND_LABEL[a.kind].toLowerCase()}): ${a.summary}. Back to: ${a.before}`, a.ownerId);
  return { ok: true, text: `Undone${o ? ': ' + o.apt : ''}. Back to: ${a.before}` };
}

/** An admin approves (the change is made now) or rejects a request (the note is optional). */
export function decide(id: string, approve: boolean | 'changes', reply = ''): { ok: boolean; text: string } {
  const S = cur(), a = S.approvals.find(x => x.id === id), t = at(15), admin = S.staffName || S.by;
  if (!a) return { ok: false, text: 'That request was not found' };
  if (a.status !== 'pending') return { ok: false, text: `That request was already ${a.status === 'withdrawn' ? 'withdrawn' : a.status}${a.decidedByName ? ' by ' + a.decidedByName : ''}` };
  const o = a.ownerId ? ownerById(a.ownerId) : null;
  let text: string;
  if (approve === 'changes') {
    Object.assign(a, { status: 'changes', decidedById: S.staffId || null, decidedByName: admin, decidedD: S.today, decidedT: t, reply: reply.trim() || null });
    log(S.today, t, 'approval', `${admin} asked ${a.byName} to change the request for ${a.ownerId ? o?.apt || 'an apartment' : 'the whole project'} (${KIND_LABEL[a.kind].toLowerCase()}): ${reply.trim()}`, a.ownerId);
    return { ok: true, text: `Sent back to ${a.byName} with your note` };
  }
  if (approve) {
    check(o, a.kind, a.change);
    const same = noChange(o, a.kind, a.change), prev = !same && UNDO_KINDS.includes(a.kind) && a.change.apply !== 'current' ? before(o, a.kind, a.change) : null;
    text = same ? 'Approved; this was already in place, so nothing changed' : applyChange(o, a.kind, a.change, `${admin}, as asked by ${a.byName}`);
    a.undo = prev ? { prev, bills: billsNow(o, a.kind), doneD: null, doneBy: null } : null;
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

/** A new possession: the flat gets its owner and is billed from now on. Used by an Admin directly, or when an Admin
 *  approves a building manager's request. */
export function addPossession(c: Record<string, unknown>, who: string) {
  checkPossession(c);
  const S = cur(), apt = String(c.apt).toUpperCase(), phone = String(c.phone || ''), possession = String(c.possession);
  const plan = (['monthly', 'sixmonthly', 'annual', 'quarterly'].includes(String(c.plan)) ? String(c.plan) : 'monthly') as Plan;
  // A vacant apartment (its last customer left): the new customer takes over the same apartment record.
  const prev = S.owners.filter(x => x.status === 'closed' && x.apt.toUpperCase() === apt).sort((a, b) => (b.closedOn || '').localeCompare(a.closedOn || ''))[0];
  const rd = c.reading != null && String(c.reading) !== '' && Number.isFinite(Number(c.reading)) ? { d: possession, reading: Number(c.reading) } : null;
  // The customer's ID: the next in this building (the customers without a stored ID keep theirs from now on too).
  keepCustIds();
  const cid = nextCustId(), added = flatByApt(apt);
  const o = blankOwner({ id: 'O' + nid('o'), project: S.project, apt: prev ? prev.apt : added?.apt || apt, block: String(c.block || '') || prev?.block || added?.block || apt.split(/[-\s]/)[0], type: String(c.type), name: String(c.name), phone: phone ? normPhone(phone) : '', email: String(c.email || ''),
    customerId: cid, cnic: c.cnic ? String(c.cnic) : null, cnicExpiry: /^\d{4}-\d{2}-\d{2}$/.test(String(c.cnicExpiry || '')) ? String(c.cnicExpiry) : null, cnicAddress: c.cnicAddress ? String(c.cnicAddress) : null,
    ...(!prev && (c.floor || added?.floor) ? { floor: String(c.floor || added?.floor || '') } : {}),
    possession, possessionKnown: true, firstBill: addDays(possession, S.settings.rules.graceDays ?? 25), plan, invalidPhone: !phone, noPhone: !phone,
    ...(prev ? { unit: unitOf(prev), prevOwnerId: prev.id, floor: prev.floor } : {}), meterIn: rd,
    notes: [{ d: S.today, by: who, text: `Possession handed over on ${fd(possession)}.${c.note ? ' ' + String(c.note) : ''}` }] });
  S.owners.push(o);
  const next = nextBillFor(o);
  log(S.today, at(15), 'admin', `New possession: ${apt} (${String(c.type)}) handed over to ${String(c.name)} (customer ${cid}${c.cnic ? `, CNIC ${String(c.cnic)}` : ''}) on ${fd(possession)}, recorded by ${who}. ${PLAN_LABEL[plan]} billing; first bill on ${fd(next)}`, o.id);
  return { id: o.id, apt, next, cid };
}
