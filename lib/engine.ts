// The billing engine, ported from the demo (demo/minawa-maintenance-demo.html) and moved to Minawa's calendar:
// every flat is billed on the 25th (billDay) in advance for its plan's months (the 25 Nov bill is for December;
// quarterly and annual plans for the coming quarter or year) plus the utility bills the accountant entered; due `dueDays` later, with reminders `remindDays` before the due date. The day after
// the due date the fine (`feePct`% of the unpaid bills, and of old arrears only if `fineArrears`; set by the accountant) is added and a final notice goes out;
// `flagDays` after the due date unpaid flats are flagged. Billing starts at possession (first month prorated).
// Promises to pay pause notices; payments pay the fine in proportion and dues oldest first.
//
// Engine functions are synchronous and work on one project's State, set with use(). The store loads the
// State, the engine changes it, and the store saves what changed. Messages and payment links are only
// recorded here; lib/dispatch.ts creates the Safepay links and sends the WhatsApp messages afterwards.
import type { State, Owner, Bill, PayLink, Message, Payment, Applied, Target, Breakdown, Proof, LogEntry, BillLine } from './types';
import { PLAN_MONTHS } from './types';
import { addDays, diff, dim, fd, fds, fm, rs, first, fill, MON, MONL, nextMonth, prevMonth, nowPKT } from './fmt';

let S: State = null as unknown as State;
let SEEDING = false, QUIET = false;

/** Run fn with `state` as the engine's current state. fn must be synchronous. */
export function use<T>(state: State, fn: () => T): T {
  const prev = S; S = state;
  try { return fn(); } finally { S = prev; }
}
export function seeding<T>(fn: () => T): T { const p = SEEDING; SEEDING = true; try { return fn(); } finally { SEEDING = p; } }
/** Catching up past days (e.g. on import): bills and fees are made, but their messages are recorded as not sent. */
export function quietly<T>(fn: () => T): T { const p = QUIET; QUIET = true; try { return fn(); } finally { QUIET = p; } }
export const cur = () => S;

/* ---------- state helpers ---------- */
export function nid(k: string) { S.seq[k] = (S.seq[k] || 0) + 1; return S.seq[k]; }
let clockMin = 0;
/** A time for an event. When a staff member is acting (a real click in the CRM), the real time in Pakistan;
 *  for the system's simulated or catch-up days, the demo's clock at that hour. */
export function at(h: number) {
  if (S?.staffId) return nowPKT();
  clockMin = (clockMin + 17) % 60; return `${String(h).padStart(2, '0')}:${String(clockMin).padStart(2, '0')}`;
}
export function log(d: string, t: string, kind: string, text: string, ownerId?: string | null) {
  const e: LogEntry = { id: 'L' + nid('log'), project: S.project, d, t, kind, text, ownerId: ownerId || null, staffId: S.staffId || null, by: S.staffId ? S.staffName || S.by : null };
  S.log.push(e);
}
const R = () => S.settings.rules;
export const feePct = () => R().feePct;
export const ownerById = (id: string) => S.owners.find(o => o.id === id) as Owner;
export const billsOf = (o: Owner) => S.bills.filter(b => b.ownerId === o.id).sort((a, b) => a.billDate < b.billDate ? -1 : 1);
export const balance = (o: Owner) => S.entries.reduce((s, e) => e.ownerId === o.id ? s + e.amount : s, 0);
export const unpaidMaint = (b: Bill) => b.net - b.paid;
export const unpaid = (b: Bill) => (b.net - b.paid) + (b.fine - b.finePaid);
export const promiseOn = (o: Owner, d: string) => !!o.promiseUntil && d <= o.promiseUntil;
export const activeLink = (o: Owner) => S.links.find(l => l.ownerId === o.id && l.status === 'active');
export const isAdmin = () => S.role === 'admin';
export const goLive = () => S.goLive;
/** Opening balances (arrears from the accountant's sheet) fall due with the first bill, not on go-live day. */
export const openingDue = () => addDays(billDateOf(prevMonth(S.goLive.slice(0, 7))), R().dueDays);

export const rateTypes = () => [...new Set(S.rates.map(r => r.type))];
export function rateFor(type: string, d: string) {
  let r: { from: string; amount: number } | null = null;
  for (const x of S.rates) if (x.type === type && x.from <= d && (!r || x.from > r.from)) r = x;
  return r ? r.amount : 0;
}
/* Generator charges: a flat on the project's Generator Charges List is billed on the "<type> + generator" rate card
 * (Royal Enclave: Apartment 12,000, Apartment + generator 15,000) where that card exists. A flat's own agreed rate still
 * wins. Bills store their amount, so changing the list only affects bills made after the change. */
export const GEN = ' + generator';
export const genType = (type: string) => type + GEN;
export const isGenType = (type: string) => type.endsWith(GEN);
export const baseTypes = () => rateTypes().filter(t => !isGenType(t));
/** Whether this project has generator rate cards (and so a Generator Charges List). */
export const hasGenerator = () => S.rates.some(r => isGenType(r.type));
/** The rate card a flat is billed on for a bill on day d. */
export function cardType(o: Owner, d: string) {
  return o.generator && S.rates.some(r => r.type === genType(o.type) && r.from <= d) ? genType(o.type) : o.type;
}
export const cardRate = (o: Owner, d: string) => rateFor(cardType(o, d), d);
/** What one month of maintenance costs this flat on day d: its own rate, or its rate card (with or without generator). */
export const rateOf = (o: Owner, d: string) => o.rate || cardRate(o, d);
export function discountFor(o: Owner, d: string, amount: number) {
  const x = o.discount;
  if (!x || !x.value) return 0;
  if (x.until && d > x.until) return 0;
  return x.kind === 'pct' ? Math.round(amount * x.value / 100) : Math.min(x.value, amount);
}
/** The bill day in a month (the 25th, or the last day of a shorter month). */
export function billingDay(_o: Owner | null, y: number, m: number) { return Math.min(R().billDay, dim(y, m)); }
export const billDateOf = (p: string) => `${p}-${String(billingDay(null, +p.slice(0, 4), +p.slice(5, 7))).padStart(2, '0')}`;
const covered = (o: Owner, p: string) => S.bills.some(b => b.ownerId === o.id && b.months > 0 && b.period <= p && p <= (b.periodEnd || b.period));
/** The first month not billed yet for this flat (go-live or later): where a change to its rate starts to count. */
export function nextPeriodFor(o: Owner) {
  let p = S.today.slice(0, 7);
  if (p < S.goLive.slice(0, 7)) p = S.goLive.slice(0, 7);
  for (let i = 0; i < 36 && covered(o, p); i++) p = nextMonth(p);
  return p;
}
/** Last month of the plan period that month p falls in (calendar quarters and years). */
export function planEnd(o: Owner, p: string) {
  const n = PLAN_MONTHS[o.plan || 'monthly'] || 1, y = +p.slice(0, 4), m = +p.slice(5, 7);
  const end = Math.ceil(m / n) * n;
  return `${y}-${String(end).padStart(2, '0')}`;
}
/** Months to bill on bill day d. Maintenance is billed in advance: the bill on 25 Nov is for December.
 *  Every month not billed yet from possession (or go-live) to the end of the plan period of the coming month.
 *  Monthly on 25 Nov: December. Quarterly on 25 Dec: Jan–Mar. Annual on 25 Dec: the next year.
 *  Possessed 5 Nov: on 25 Nov, November (prorated) and December. Possessed 28 Nov: on 25 Dec, Nov (3 days), Dec and Jan. */
export function monthsToBill(o: Owner, d: string) {
  if (o.possession > d) return [];
  const ahead = nextMonth(d.slice(0, 7)), startP = [o.possession.slice(0, 7), S.goLive.slice(0, 7)].sort()[1], out: string[] = [];
  for (let m = startP; m <= planEnd(o, ahead); m = nextMonth(m)) if (!covered(o, m)) out.push(m);
  return out;
}
/** One month's maintenance: the rate card (or the flat's own rate), prorated in the month of possession. */
export function monthCharge(o: Owner, p: string) {
  const full = rateOf(o, billDateOf(p));
  if (o.possession.slice(0, 7) === p && +o.possession.slice(8) > 1) {
    const days = dim(+p.slice(0, 4), +p.slice(5, 7)), from = +o.possession.slice(8);
    return { amount: Math.round(full * (days - from + 1) / days), full, from: o.possession };
  }
  return { amount: full, full, from: null as string | null };
}
const unbilled = (o: Owner, p: string) => S.charges.filter(c => c.ownerId === o.id && !c.billId && c.amount !== 0 && c.period <= p);
/** The first bill day on or after `from`. */
export function nextBillDate(from: string) { const d = billDateOf(from.slice(0, 7)); return d >= from ? d : billDateOf(nextMonth(from.slice(0, 7))); }
/** The next bill day on which this owner actually gets a maintenance bill (plans and go-live taken into account). */
export function nextBillFor(o: Owner) {
  let from = S.settings.lastRun === S.today ? addDays(S.today, 1) : S.today;
  for (let i = 0; i < 14; i++) { const d = nextBillDate(from); if (o.exempt || monthsToBill(o, d).length) return d; from = addDays(d, 1); }
  return nextBillDate(from);
}
export function isBillingDay(o: Owner, d: string) {
  if (o.status !== 'active') return false;   // months before go-live are never billed (see monthsToBill)
  const y = +d.slice(0, 4), m = +d.slice(5, 7);
  if (+d.slice(8, 10) !== billingDay(o, y, m)) return false;
  if (S.bills.some(b => b.ownerId === o.id && b.billDate === d)) return false;
  return (!o.exempt && monthsToBill(o, d).length > 0) || unbilled(o, d.slice(0, 7)).length > 0;
}
/** "November 2026", "Jan – Mar 2027", "2027"; utility-only bills say so. */
export function periodLabel(b: Pick<Bill, 'period' | 'periodEnd' | 'months'>) {
  if (!b.months) return `${fm(b.period)} utilities`;
  if (b.months === 1 || b.period === b.periodEnd) return fm(b.period);
  const [y1, m1] = [b.period.slice(0, 4), +b.period.slice(5, 7)], [y2, m2] = [b.periodEnd.slice(0, 4), +b.periodEnd.slice(5, 7)];
  if (m1 === 1 && m2 === 12 && y1 === y2) return `Year ${y1}`;
  return y1 === y2 ? `${MON[m1 - 1]} – ${MON[m2 - 1]} ${y2}` : `${MON[m1 - 1]} ${y1} – ${MON[m2 - 1]} ${y2}`;
}
export function periodShort(b: Pick<Bill, 'period' | 'periodEnd' | 'months'>) {
  if (!b.months) return `${MON[+b.period.slice(5) - 1]} ${b.period.slice(0, 4)} utilities`;
  if (b.months === 1 || b.period === b.periodEnd) return `${MON[+b.period.slice(5) - 1]} ${b.period.slice(0, 4)}`;
  return periodLabel(b);
}

/* ---------- monthly target ---------- */
const tgInc = () => S.settings.tgInc;
export function monthTarget(p: string): Target {
  const y = +p.slice(0, 4), m = +p.slice(5, 7), end = `${p}-${String(dim(y, m)).padStart(2, '0')}`, inc = tgInc();
  const t: Target = { p, total: 0, gross: 0, flats: 0, disc: 0, discN: 0, discOn: 0, discOnN: 0, own: 0, ownN: 0, excluded: 0, exOut: 0, exOn: 0, exOnN: 0, types: [] };
  const byType: Record<string, { type: string; n: number; rate: number; sub: number }> = {};
  if (p < S.goLive.slice(0, 7)) return t;   // nothing is billed before go-live (opening balances cover it)
  for (const o of S.owners) {
    if (o.status !== 'active') continue;
    const d = billDateOf(p), ct = cardType(o, d), card = rateFor(ct, d), amt = o.rate || card;
    if (o.exempt) {
      if (inc.exempt.includes(o.id)) { t.exOn += amt; t.exOnN++; t.total += amt; } else { t.excluded++; t.exOut += amt; }
      continue;
    }
    if (o.possession > end) continue;
    const disc = discountFor(o, d, amt);
    const ty = byType[ct] || (byType[ct] = { type: ct, n: 0, rate: card, sub: 0 });
    ty.n++; ty.sub += card; t.gross += card; t.flats++;
    if (o.rate && o.rate !== card) { t.own += o.rate - card; t.ownN++; }
    const fullRate = disc && inc.disc.includes(o.id);
    if (disc && fullRate) { t.discOn += disc; t.discOnN++; } else if (disc) { t.disc += disc; t.discN++; }
    t.total += amt - (fullRate ? 0 : disc);
  }
  t.types = Object.values(byType).sort((a, b) => a.rate - b.rate);
  return t;
}
export function tgLists() {
  const p = S.today.slice(0, 7), y = +p.slice(0, 4), m = +p.slice(5, 7);
  const disc: { o: Owner; disc: number }[] = [], exempt: { o: Owner; amt: number }[] = [];
  for (const o of S.owners) {
    if (o.status !== 'active') continue;
    const d = billDateOf(p), amt = rateOf(o, d);
    if (o.exempt) exempt.push({ o, amt });
    else { const x = discountFor(o, d, amt); if (x) disc.push({ o, disc: x }); }
  }
  const byApt = (a: { o: Owner }, b: { o: Owner }) => aptOrder(a.o, b.o);
  return { disc: disc.sort(byApt), exempt: exempt.sort(byApt) };
}
export function setTarget(p: string, d?: string) {
  S.settings.targets[p] = monthTarget(p);
  if (d) log(d, '09:00', 'job', `${S.proj.name}: ${fm(p)} target set at ${rs(S.settings.targets[p].total)}, what ${S.settings.targets[p].flats} billed flats owe for the month at the rate card`);
  return S.settings.targets[p];
}
export function getTarget(p: string) {
  const t = S.settings.targets[p];
  if (t) return t;
  return p <= S.today.slice(0, 7) ? setTarget(p) : monthTarget(p);
}
export function setTargetOption(key: 'disc' | 'exempt', id: string | null, on: boolean) {
  const inc = tgInc(), lists = tgLists();
  if (id == null) inc[key] = on ? lists[key].map(x => x.o.id) : [];
  else inc[key] = on ? [...new Set([...inc[key], id])] : inc[key].filter(x => x !== id);
  const p = S.today.slice(0, 7), t = setTarget(p);
  const dOn = lists.disc.filter(x => inc.disc.includes(x.o.id)).length, eOn = lists.exempt.filter(x => inc.exempt.includes(x.o.id)).length;
  log(S.today, at(15), 'admin', `Target settings changed by ${S.by}: ${dOn} of ${lists.disc.length} discounted flats at the full rate, ${eOn} of ${lists.exempt.length} exempt or on-hold flats counted. ${fm(p)} target is now ${rs(t.total)}`);
  return t;
}

function addEntry(ownerId: string, d: string, kind: string, amount: number, desc: string, extra?: { ref?: string; pid?: string }) {
  S.entries.push({ id: 'E' + nid('e'), ownerId, project: S.project, d, kind, amount, desc, ref: extra?.ref || null, pid: extra?.pid || null });
}

/* ---------- engine ---------- */
export function createBill(o: Owner, d: string, opts: { utilitiesOnly?: boolean } = {}) {
  const before = balance(o), p = d.slice(0, 7);
  const months = o.exempt || opts.utilitiesOnly ? [] : monthsToBill(o, d), lines: BillLine[] = [];
  let amount = 0, disc = 0, extras = 0;
  for (const m of months) {
    const c = monthCharge(o, m), x = discountFor(o, billDateOf(m), c.amount);
    amount += c.amount; disc += x;
    lines.push({ kind: 'maintenance', label: `Maintenance, ${o.rate ? o.type : cardType(o, billDateOf(m))}, ${fm(m)}${c.from ? ` (from ${fds(c.from)}, ${rs(c.full)} a month)` : ''}`, amount: c.amount });
    if (x) lines.push({ kind: 'discount', label: `Discount, ${fm(m)}${o.discount?.kind === 'pct' ? ` (${o.discount.value}%)` : ''}`, amount: -x });
  }
  const id = 'BL-' + (2600 + nid('bill'));
  const ch = unbilled(o, p);
  for (const c of ch) { c.billId = id; extras += c.amount; lines.push({ kind: 'utility', label: `${c.kind}, ${fm(c.period)}${c.units ? ` (${c.units} units)` : ''}${c.note ? ` · ${c.note}` : ''}`, amount: c.amount }); }
  const b: Bill = { id, ownerId: o.id, project: S.project, period: months[0] || p, periodEnd: months[months.length - 1] || p, months: months.length, billDate: d,
    dueDate: addDays(d, R().dueDays), finalDate: addDays(addDays(d, R().dueDays), R().flagDays), amount, discount: disc, extras, net: amount - disc + extras, paid: 0, fine: 0, finePaid: 0,
    fined: false, fromCredit: 0, prev: Math.max(0, before), noticeSkipped: false, flagSkipped: false, reminders: [], lines, bd: null };
  S.bills.push(b);
  if (amount) addEntry(o.id, d, 'bill', amount, `Maintenance · ${o.rate ? o.type : cardType(o, d)} · ${periodLabel(b)}`, { ref: b.id });
  if (disc && o.discount) addEntry(o.id, d, 'discount', -disc, o.discount.kind === 'pct' ? `Discount ${o.discount.value}%` : 'Discount (fixed)', { ref: b.id });
  for (const c of ch) addEntry(o.id, d, 'utility', c.amount, `${c.kind} · ${fm(c.period)}`, { ref: b.id });
  if (o.credit > 0) {
    const x = Math.min(o.credit, b.net);
    b.paid += x; b.fromCredit = x; o.credit -= x;
    log(d, '11:00', 'payment', `${rs(x)} of the ${periodLabel(b)} bill for ${o.apt} taken from advance credit`, o.id);
  }
  log(d, '11:00', 'bill', `Bill ${b.id} created for ${o.apt}: ${rs(b.net)} (${periodLabel(b)}${extras ? `, incl. ${rs(extras)} utilities` : ''}), due ${fd(b.dueDate)}`, o.id);
  return b;
}
export const duesOf = (o: Owner) => (o.openingLeft || 0) + billsOf(o).reduce((s, b) => s + Math.max(0, b.net - b.paid), 0);
const isLate = (o: Owner, d: string) => (o.openingLeft > 0 && d > openingDue()) || billsOf(o).some(b => unpaidMaint(b) > 0 && d > b.dueDate);
/** What the fine is a % of: unpaid bills, plus old arrears only when the project fines them (rules.fineArrears). */
export const fineBase = (o: Owner) => (R().fineArrears ? o.openingLeft || 0 : 0) + billsOf(o).reduce((s, b) => s + Math.max(0, b.net - b.paid), 0);
const fineLate = (o: Owner, d: string) => R().fineArrears ? isLate(o, d) : billsOf(o).some(b => unpaidMaint(b) > 0 && d > b.dueDate);
/** After the fine % changes: bring every late owner's fine to the new % (up or down). Returns owners changed. */
export function resyncFines(d: string, t: string, by: string) {
  const changed: Owner[] = [];
  for (const o of S.owners) {
    if (o.status !== 'active' || o.exempt || !fineLate(o, d)) continue;
    const dues = fineBase(o), target = Math.round(dues * feePct() / 100), delta = target - (o.feeDue || 0);
    if (!delta) continue;
    o.feeDue = target;
    addEntry(o.id, d, 'fine', delta, `Fine changed to ${feePct()}% by ${by}: ${feePct()}% of ${rs(dues)} dues is ${rs(target)}`);
    changed.push(o);
  }
  log(d, t, 'fine', `Fine set to ${feePct()}% by ${by}; ${changed.length} late owner${changed.length === 1 ? '' : 's'} updated`);
  return changed;
}
function syncFee(o: Owner, d: string) {
  if (!fineLate(o, d)) return 0;
  const dues = fineBase(o), target = Math.round(dues * feePct() / 100), add = target - (o.feeDue || 0);
  if (add <= 0) return 0;
  o.feeDue = (o.feeDue || 0) + add;
  addEntry(o.id, d, 'fine', add, `Fine: ${feePct()}% of ${rs(dues)} dues is ${rs(target)}`);
  log(d, '11:00', 'fine', `Fine for ${o.apt} is now ${rs(target)}: ${feePct()}% of ${rs(dues)} owed`, o.id);
  return add;
}
function allocate(o: Owner, amt: number): Applied[] {
  let left = amt;
  const out: Applied[] = [];
  const put = (kind: Applied['kind'], label: string, x: number) => { if (x <= 0) return; const r = out.find(y => y.label === label); if (r) r.amount += x; else out.push({ kind, label, amount: x }); };
  const dues = duesOf(o), fee = o.feeDue || 0, feeL = `Fine (${feePct()}%)`;
  const toFee = dues > 0 ? Math.min(fee, Math.round(amt * fee / (dues + fee))) : Math.min(fee, amt);
  o.feeDue = fee - toFee; left -= toFee; put('fee', feeL, toFee);
  if (o.openingLeft > 0) { const x = Math.min(left, o.openingLeft); o.openingLeft -= x; left -= x; put('dues', `Earlier dues (before ${fm(goLive().slice(0, 7))})`, x); }
  for (const b of billsOf(o)) { if (left <= 0) break; const x = Math.min(left, b.net - b.paid); if (x > 0) { b.paid += x; left -= x; put('dues', `${b.months ? 'Maintenance' : 'Utilities'}, ${periodLabel(b)}`, x); } }
  if (left > 0 && o.feeDue > 0) { const x = Math.min(left, o.feeDue); o.feeDue -= x; left -= x; put('fee', feeL, x); }
  if (left > 0) { o.credit += left; put('credit', 'Kept as advance credit', left); }
  return out;
}
/** A credit or waiver given by staff (e.g. an agreed reduction): lowers what is owed like a payment, without a receipt. */
export function waive(o: Owner, amt: number, reason: string, d: string, t: string, by: string) {
  addEntry(o.id, d, 'adjustment', -amt, `Adjustment by ${by}: ${reason}`);
  const applied = allocate(o, amt);
  log(d, t, 'admin', `${rs(amt)} credited to ${o.apt} by ${by}: ${reason}`, o.id);
  if (balance(o) <= 0 && o.flagged) { o.flagged = false; log(d, t, 'flag', `${o.apt} flag cleared: nothing owed after the adjustment`, o.id); }
  return applied;
}
export function cancelLinks(o: Owner, d: string, t: string, why: string) {
  for (const l of S.links) if (l.ownerId === o.id && l.status === 'active') {
    l.status = 'cancelled'; l.cancelledOn = d;
    log(d, t, 'link', `Link ${l.id} cancelled (${why})`, o.id);
  }
}
export function createLink(o: Owner, d: string, t: string, amount: number, why: string) {
  cancelLinks(o, d, t, why);
  const l: PayLink = { id: 'PL-' + (4800 + nid('link')), ownerId: o.id, project: S.project, amount, status: 'active', created: d,
    cancelledOn: null, paidOn: null, sp: null, spSettled: false, spError: null };
  S.links.push(l);
  log(d, t, 'link', `Payment link ${l.id} created for ${rs(amount)}`, o.id);
  return l;
}
type MsgIn = Partial<Message> & { kind: string; title: string; text: string };
export function pushMsg(o: Owner, d: string, t: string, m: MsgIn) {
  const msg: Message = { id: 'M' + nid('msg'), ownerId: o.id, project: S.project, d, t, from: 'biz', tpl: null, vars: null, linkId: null, pdf: null,
    status: 'queued', waId: null, error: null, manual: false, shot: false, sentAt: null, ...m };
  if (msg.from === 'biz') {
    if (o.invalidPhone) { msg.status = 'failed'; msg.error = o.noPhone ? 'No WhatsApp number on file' : 'Number not on WhatsApp'; }
    else if (SEEDING) msg.status = 'read';
    else if (QUIET) { msg.status = 'skipped'; msg.error = 'Made while catching up past days on import, not sent'; }
    else msg.status = 'pending';   // sent by hand: waits in Send on WhatsApp
  } else msg.status = 'delivered';
  S.messages.push(msg);
  if (msg.status === 'failed') log(d, t, 'alert', `WhatsApp message to ${o.apt} failed: ${o.noPhone ? 'no WhatsApp number on file' : 'number not on WhatsApp'}. Added to To do`, o.id);
  return msg;
}
// Values for a message's text (the months go on one line).
export function bdVars(bd: Breakdown) {
  return { breakdown: bd.rows.map(r => `${r.short} ${rs(r.amount)}`).join(' + ') || 'none', dues: rs(bd.dues), fee: rs(bd.fee) };
}
export function sendBill(o: Owner, b: Bill, d: string) {
  const bal = balance(o), t = '11:00';
  if (bal <= 0) {
    pushMsg(o, d, t, { kind: 'bill', title: `Bill · ${periodLabel(b)}`, pdf: { kind: 'bill', id: b.id }, tpl: 'credit',
      vars: { name: first(o.name), month: periodLabel(b), amount: rs(b.net), apt: o.apt, credit: rs(-bal) },
      text: `Hi ${first(o.name)}, your ${periodLabel(b)} maintenance of ${rs(b.net)} for Apt ${o.apt} was paid from your advance credit. Credit left: ${rs(-bal)}.` });
  } else {
    const l = createLink(o, d, t, bal, 'replaced by the new bill');
    const bd = b.bd = duesBreakdown(o);
    const vars = { name: first(o.name), apt: o.apt, month: periodLabel(b), amount: rs(b.net), ...bdVars(bd), total: rs(bal), due: fd(b.dueDate) };
    pushMsg(o, d, t, { kind: 'bill', title: `Bill · ${periodLabel(b)}`, text: fill(S.templates.bill.text, vars), tpl: 'bill', vars, linkId: l.id, pdf: { kind: 'bill', id: b.id } });
  }
  if (!o.invalidPhone) log(d, t, 'message', `Bill for ${periodLabel(b)} ready to send to ${o.apt} (Send on WhatsApp)`, o.id);
}
function sendNotice(o: Owner, b: Bill, d: string, newBill?: Bill) {
  const bal = balance(o), t = '11:00';
  const l = createLink(o, d, t, bal, 'replaced by the disconnection notice');
  const bd = (newBill || b).bd = duesBreakdown(o);
  const vars = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal), month: periodLabel(b), final: fd(b.finalDate) };
  let text = fill(S.templates.notice.text, vars);
  if (newBill) text += `\n\nThis total includes your new ${periodLabel(newBill)} bill.`;
  pushMsg(o, d, t, { kind: 'notice', title: 'Final notice', text, tpl: 'notice', vars, linkId: l.id, pdf: { kind: 'bill', id: (newBill || b).id } });
  if (!o.invalidPhone) log(d, t, 'message', `Disconnection notice ready to send to ${o.apt}: ${rs(bal)}, final deadline ${fd(b.finalDate)}`, o.id);
}
// New: a friendly reminder a few days before the due date, with a fresh payment link.
function sendReminder(o: Owner, b: Bill, d: string) {
  const bal = balance(o), t = '11:00';
  if (bal <= 0) return;
  const l = createLink(o, d, t, bal, 'replaced by the reminder');
  const bd = duesBreakdown(o);
  const vars = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal), due: fd(b.dueDate) };
  pushMsg(o, d, t, { kind: 'reminder', title: 'Reminder', text: fill(S.templates.reminder.text, vars), tpl: 'reminder', vars, linkId: l.id, pdf: { kind: 'statement', id: o.id } });
  if (!o.invalidPhone) log(d, t, 'message', `Reminder ready to send to ${o.apt}: ${rs(bal)} due ${fd(b.dueDate)}`, o.id);
}
function flag(o: Owner, d: string) {
  o.flagged = true; o.flaggedOn = d;
  log(d, '11:00', 'flag', `${o.apt} flagged for disconnection: ${rs(balance(o))} unpaid after the final deadline`, o.id);
}
export function runDaily(d: string) {
  const c = { bills: 0, fines: 0, notices: 0, flags: 0, alerts: 0, paused: 0, reminders: 0 };
  if (d.slice(8) === '01') setTarget(d.slice(0, 7), d);
  const out = new Map<string, { bill?: Bill; notice?: Bill; remind?: Bill }>();
  const box = (id: string) => { if (!out.has(id)) out.set(id, {}); return out.get(id)!; };
  for (const o of S.owners) {
    if (o.status !== 'active' || o.exempt) continue;
    if (isBillingDay(o, d)) { box(o.id).bill = createBill(o, d); c.bills++; }
    for (const b of billsOf(o)) {
      for (const rd of R().remindDays) {
        if (rd > 0 && !b.reminders.includes(rd) && addDays(b.dueDate, -rd) === d && unpaidMaint(b) > 0 && !promiseOn(o, d) && d > b.billDate) { b.reminders.push(rd); box(o.id).remind = b; }
      }
      if (addDays(b.dueDate, 1) === d && !b.fined && unpaidMaint(b) > 0) {
        b.fined = true;
        if (promiseOn(o, d)) { b.noticeSkipped = true; c.paused++; log(d, '11:00', 'job', `Disconnection notice for ${o.apt} paused: promise to pay until ${fd(o.promiseUntil!)}`, o.id); }
        else box(o.id).notice = b;
      }
      if (b.finalDate === d && unpaid(b) > 0 && !o.flagged) {
        if (promiseOn(o, d)) { b.flagSkipped = true; log(d, '11:00', 'job', `Flag for ${o.apt} paused: promise to pay until ${fd(o.promiseUntil!)}`, o.id); }
        else { flag(o, d); c.flags++; }
      }
    }
    if (syncFee(o, d)) c.fines++;
    if (o.promiseUntil && addDays(o.promiseUntil, 1) === d) {
      const was = o.promiseUntil; o.promiseUntil = null;
      if (balance(o) > 0) {
        S.alerts.push({ id: 'AL' + nid('al'), ownerId: o.id, project: S.project, d, text: `Promise to pay by ${fd(was)} not kept. ${rs(balance(o))} still owed.`, done: false });
        log(d, '11:00', 'alert', `Promise to pay broken: ${o.apt} still owes ${rs(balance(o))}. Accountant alerted; notices resume`, o.id);
        c.alerts++;
        const sk = billsOf(o).filter(b => b.noticeSkipped && unpaid(b) > 0);
        if (sk.length) { box(o.id).notice = sk[sk.length - 1]; sk.forEach(b => { b.noticeSkipped = false; }); }
        if (!o.flagged && billsOf(o).some(b => b.flagSkipped && unpaid(b) > 0)) { flag(o, d); c.flags++; }
      }
    }
  }
  for (const [id, x] of out) {
    const o = ownerById(id);
    if (x.notice) { sendNotice(o, x.notice, d, x.bill); c.notices++; }
    else if (x.bill) sendBill(o, x.bill, d);
    else if (x.remind) { sendReminder(o, x.remind, d); c.reminders++; }
  }
  log(d, '11:00', 'job', `Daily run: ${c.bills} bill(s), ${c.fines} fine(s), ${c.notices} notice(s), ${c.reminders} reminder(s), ${c.flags} flag(s)${c.paused ? `, ${c.paused} paused by promise` : ''}`);
  return c;
}
export function recordPayment(o: Owner, amt: number, method: string, ref: string | null, d: string, source: Payment['source'], t: string, by: string, extra?: Partial<Payment>) {
  const pid = 'PAY-' + (1000 + nid('pay')), before = balance(o);
  addEntry(o.id, d, 'payment', -amt, `Payment · ${method}${extra && extra.gateway ? ' · ' + extra.gateway : ''}`, { ref: ref || pid, pid });
  const applied = allocate(o, amt);
  const bal = balance(o);
  const p: Payment = { id: pid, ownerId: o.id, project: S.project, d, t, amount: amt, method, ref: ref || pid, source, by: by || 'Provider', before, applied, balAfter: bal,
    receipt: 'RC-' + d.slice(0, 4) + '-' + String(nid('rc' + d.slice(0, 4))).padStart(4, '0'), gateway: null, gwMode: null, linkId: null, spLink: null, spTracker: null, ...(extra || {}) };
  S.payments.push(p);
  if (source !== 'link') cancelLinks(o, d, t, 'payment recorded another way');
  log(d, t, 'payment', `${rs(amt)} recorded for ${o.apt} · ${method}${source === 'link' ? '' : ` · by ${p.by}`}. Allocated to oldest dues first`, o.id);
  if (bal <= 0 && o.flagged) {
    o.flagged = false;
    const susp = o.suspensions.some(s => !s.to);
    log(d, t, 'flag', `${o.apt} flag cleared: all dues paid${susp ? '. Restore suspended services' : ''}`, o.id);
  }
  let linkId: string | null = null;
  if (bal > 0) linkId = createLink(o, d, t, bal, 'balance changed').id;
  const vars = { name: first(o.name), paid: rs(amt), apt: o.apt, date: fd(d), balance: bal > 0 ? rs(bal) : bal < 0 ? `Rs 0 (credit ${rs(-bal)})` : 'Rs 0' };
  pushMsg(o, d, t, { kind: 'receipt', title: 'Payment received', text: fill(S.templates.receipt.text, vars) + (bal > 0 ? '\nTap Pay Now to pay the rest.' : ''), tpl: 'receipt', vars, linkId, pdf: { kind: 'receipt', id: pid } });
  return p;
}
export function payLink(l: PayLink, method: string, d: string, t: string, mode: Payment['gwMode'] = 'simulated') {
  const o = ownerById(l.ownerId);
  log(d, t, 'webhook', `Safepay payment confirmed for ${l.id}: ${rs(l.amount)} by ${method}${mode === 'simulated' ? ' (simulated)' : ''}. Status re-checked with Safepay`, o.id);
  l.status = 'paid'; l.paidOn = d; l.spSettled = true;
  return recordPayment(o, l.amount, method, l.sp?.tracker || l.id, d, 'link', t, 'Safepay',
    { gateway: 'Safepay', gwMode: mode, linkId: l.id, spLink: l.sp?.id || null, spTracker: l.sp?.tracker || null });
}
// A Safepay link that was paid after it had been replaced: still money received, recorded; any extra becomes credit.
export function payStaleLink(l: PayLink, d: string, t: string, mode: Payment['gwMode']) {
  const o = ownerById(l.ownerId);
  l.spSettled = true;
  log(d, t, 'webhook', `Safepay: older link ${l.id} was paid after it was replaced. Recorded; any extra becomes credit`, o.id);
  return recordPayment(o, l.sp?.amount || l.amount, 'Card', l.sp?.tracker || l.id, d, 'link', t, 'Safepay',
    { gateway: 'Safepay', gwMode: mode, linkId: l.id, spLink: l.sp?.id || null, spTracker: l.sp?.tracker || null });
}
export function ownerProof(o: Owner, amt: number, d: string, t: string, media?: string | null, text?: string) {
  const m = pushMsg(o, d, t, { from: 'owner', kind: 'reply', title: 'Owner reply', shot: true, text: text || `Paid ${rs(amt)} by bank transfer to Minawa Group's account. Screenshot attached.` });
  const pr: Proof = { id: 'PR' + nid('pr'), ownerId: o.id, project: S.project, d, t, amount: amt, status: 'pending', msgId: m.id, doneOn: null, media: media || null };
  S.proofs.push(pr);
  log(d, t, 'message', `Screenshot from ${o.apt} received on WhatsApp and added to To do (${rs(amt)})`, o.id);
  return pr;
}
export function verifyProof(p: Proof, d: string, t: string, by: string, amount?: number) {
  const o = ownerById(p.ownerId);
  if (amount && amount > 0) p.amount = amount;
  p.status = 'verified'; p.doneOn = d;
  return recordPayment(o, p.amount, 'Bank transfer (screenshot checked)', 'Proof #' + p.id, d, 'proof', t, by);
}
export function rejectProof(p: Proof, d: string, t: string) {
  const o = ownerById(p.ownerId);
  p.status = 'rejected'; p.doneOn = d;
  pushMsg(o, d, t, { kind: 'info', title: 'About your transfer', manual: true, text: `We couldn't find your transfer of ${rs(p.amount)} in our bank account. Please check the reference, or use Pay Now so it is confirmed automatically.` });
  log(d, t, 'message', `Screenshot from ${o.apt} not matched in the bank statement; owner told on WhatsApp`, o.id);
}
// Staff send a payment link any time (the "Send on WhatsApp" button).
export function sendPaymentLink(o: Owner, d: string, t: string) {
  const bal = balance(o);
  if (bal <= 0) return null;
  let l = activeLink(o);
  if (!l || l.amount !== bal) l = createLink(o, d, t, bal, 'replaced by a new payment link');
  const bd = duesBreakdown(o);
  const vars = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal) };
  const m = pushMsg(o, d, t, { kind: 'link', title: 'Payment link', text: fill(S.templates.link.text, vars), tpl: 'link', vars, linkId: l.id, pdf: { kind: 'statement', id: o.id }, manual: true });
  log(d, t, 'message', `Payment link for ${rs(bal)} ready to send to ${o.apt} by ${S.by}`, o.id);
  return m;
}

/* ---------- derived ---------- */
export const unitOf = (o: Owner) => o.unit || `${o.project}:${o.apt}`;
export const accountsOf = (o: Owner) => S.owners.filter(x => unitOf(x) === unitOf(o)).sort((a, b) => (+(a.status === 'active') - +(b.status === 'active')) || ((a.possession || '') < (b.possession || '') ? -1 : 1));
export const currentOf = (o: Owner) => { const a = accountsOf(o); return a.find(x => x.status === 'active') || a[a.length - 1] || o; };
export function apartments() {
  const m = new Map<string, Owner>();
  for (const o of S.owners) { const k = unitOf(o), c = m.get(k); if (!c || (o.status === 'active' && c.status !== 'active')) m.set(k, o); }
  return [...m.values()];
}
function aptKey(o: Owner): (string | number)[] {
  const b = String(o.block || '').toUpperCase(), m = String(o.apt).match(/(\d+)\s*\/?\s*([A-Za-z]?)/);
  return [/^[A-Z]$/.test(b) ? 0 : /^[A-Z]{2}$/.test(b) ? 1 : 2, b, m ? +m[1] : 0, m ? m[2].toUpperCase() : '', String(o.apt)];
}
export function aptOrder(a: Owner, b: Owner) {
  const x = aptKey(a), y = aptKey(b);
  for (let i = 0; i < x.length; i++) { if (x[i] < y[i]) return -1; if (x[i] > y[i]) return 1; }
  return 0;
}
export type OwnerStatus = 'paid' | 'due' | 'overdue' | 'flagged' | 'exempt' | 'transferred';
export function ownerStatus(o: Owner): OwnerStatus {
  if (o.status === 'closed') return 'transferred';
  if (o.exempt) return 'exempt';
  if (o.flagged) return 'flagged';
  const bal = balance(o);
  if (bal <= 0) return 'paid';
  const od = (o.openingLeft > 0 && S.today > openingDue()) || billsOf(o).some(b => unpaid(b) > 0 && S.today > b.dueDate);
  return od ? 'overdue' : 'due';
}
export interface Ev { kind: 'bill' | 'fine' | 'flag' | 'alert' | 'remind'; text: string; o: Owner }
export function eventsOn(d: string): Ev[] {
  const ev: Ev[] = [];
  for (const o of S.owners) {
    if (o.status !== 'active' || o.exempt) continue;
    if (isBillingDay(o, d)) ev.push({ kind: 'bill', text: `Bill for ${o.apt}`, o });
    for (const b of billsOf(o)) {
      for (const rd of R().remindDays) if (rd > 0 && !b.reminders.includes(rd) && addDays(b.dueDate, -rd) === d && unpaidMaint(b) > 0 && !promiseOn(o, d)) ev.push({ kind: 'remind', text: `Reminder for ${o.apt} (due ${fds(b.dueDate)})`, o });
      if (addDays(b.dueDate, 1) === d && !b.fined && unpaidMaint(b) > 0) ev.push({ kind: 'fine', text: promiseOn(o, d) ? `Fine for ${o.apt} (notice paused)` : `Fine and final notice for ${o.apt}`, o });
      if (b.finalDate === d && unpaid(b) > 0 && !o.flagged) ev.push({ kind: 'flag', text: promiseOn(o, d) ? `Final deadline for ${o.apt} (paused)` : `${o.apt} flagged for disconnection`, o });
    }
    if (o.promiseUntil && addDays(o.promiseUntil, 1) === d) ev.push({ kind: 'alert', text: `Promise to pay ends for ${o.apt}`, o });
  }
  return ev;
}
export function nextEvent() {
  for (let i = 1; i <= 62; i++) { const d = addDays(S.today, i); const ev = eventsOn(d); if (ev.length) return { d, ev }; }
  return null;
}
export function upcoming(days: number, max: number) {
  const up: { d: string; e: Ev }[] = [];
  for (let i = 1; i <= days && up.length < max; i++) { const d = addDays(S.today, i); eventsOn(d).forEach(e => { if (up.length < max) up.push({ d, e }); }); }
  return up;
}
export function collections() {
  const months: string[] = [];
  for (let p = goLive().slice(0, 7); p <= S.today.slice(0, 7);) {
    months.push(p);
    let y = +p.slice(0, 4), m = +p.slice(5, 7) + 1; if (m > 12) { m = 1; y++; }
    p = `${y}-${String(m).padStart(2, '0')}`;
  }
  return months.slice(-8).map(p => [p, S.payments.filter(x => x.d.slice(0, 7) === p).reduce((s, x) => s + x.amount, 0)] as [string, number]);
}
/** Marks an undelivered message whose owner's number was fixed but the message wasn't re-sent yet (sending by hand):
 *  it stays in To do until a message to the new number is confirmed sent. */
export const FIX_WAIT = 'Number fixed, not sent yet: ';
export const fixWaiting = (m: Message) => m.status === 'failed' && (m.error || '').startsWith(FIX_WAIT);
export function failedList() {
  const seen = new Set<string>(), out: Message[] = [];
  for (const m of [...S.messages].reverse()) {
    const o = ownerById(m.ownerId);
    if (m.status === 'failed' && o && o.status === 'active' && (o.invalidPhone || (fixWaiting(m) && balance(o) > 0)) && !seen.has(o.id)) { seen.add(o.id); out.push(m); }
  }
  return out;
}
export const followCount = () => S.proofs.filter(p => p.status === 'pending').length + failedList().length + S.alerts.filter(a => !a.done).length;
export const sortedPayments = () => [...S.payments].sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t));
export function duesBreakdown(o: Owner): Breakdown {
  const rows: Breakdown['rows'] = [];
  if (o.openingLeft > 0) rows.push({ label: `Earlier dues (before ${fm(goLive().slice(0, 7))})`, short: 'Earlier dues', amount: o.openingLeft });
  for (const b of billsOf(o)) {
    const m = unpaidMaint(b);
    if (m > 0) rows.push({ label: periodLabel(b) + (b.extras ? (b.months ? ' (with utilities)' : '') : ''), short: periodShort(b), sub: S.today > b.dueDate ? `overdue since ${fds(b.dueDate)}` : `due ${fds(b.dueDate)}`, amount: m });
  }
  const dues = rows.reduce((s, r) => s + r.amount, 0), fee = o.feeDue || 0;
  return { rows, dues, fee, feeBase: dues, total: dues + fee };
}
export function breakdownNote(o: Owner, bd: Breakdown) {
  return [`Apt ${o.apt} ${S.proj.name} - ${o.name}`, `${bd.rows.map(r => `${r.short} ${rs(r.amount)}`).join(' + ')} = Dues ${rs(bd.dues)}`,
    bd.fee ? `Fine ${feePct()}% ${rs(bd.fee)}` : null, `Total ${rs(bd.total)}`, 'Minawa Group maintenance'].filter(Boolean).join(' | ');
}
/** The office's 2026 sheets (before the CRM): what was owed for the year (arrears + charges), what was received, and
 *  what has been paid in the CRM since each sheet's date. */
export const sheetDue = (x: NonNullable<Owner['sheet']>) => x.arrears + x.maintenance + x.electricity - x.discount + x.adjust;
export function sheetOf(o: Owner) {
  const x = o.sheet; if (!x) return null;
  const since = S.payments.filter(p => p.ownerId === o.id && p.d > x.asOf).reduce((a, p) => a + p.amount, 0);
  return { ...x, due: sheetDue(x), since, paid: x.received + since };
}
export function sheetStats() {
  const list = S.owners.filter(o => o.status === 'active' && o.sheet).map(o => sheetOf(o)!);
  const sum = (k: 'due' | 'received' | 'since' | 'paid' | 'balance' | 'maintenance' | 'arrears') => list.reduce((a, x) => a + x[k], 0);
  const asOf = list.map(x => x.asOf).sort().pop() || null, src = list[0]?.source || '';
  return { sheet: list.length ? { flats: list.length, asOf, source: src, due: sum('due'), received: sum('received'), since: sum('since'), paid: sum('paid'), balance: sum('balance'),
    maintenance: sum('maintenance'), arrears: sum('arrears'), pct: sum('due') ? Math.round(100 * sum('paid') / sum('due')) : 0 } : null };
}
export function projStats() {
  const act = S.owners.filter(o => o.status === 'active' && !o.exempt), owe = act.filter(o => balance(o) > 0), mon = S.today.slice(0, 7);
  const coll = S.payments.filter(p => p.d.slice(0, 7) === mon).reduce((s, p) => s + p.amount, 0), target = getTarget(mon).total;
  const arrears = act.reduce((s, o) => s + (o.openingLeft || 0), 0), arrearsOwing = act.filter(o => o.openingLeft > 0).length;
  // Before the first bill: when billing starts (the bill day of the month before go-live, for the go-live month).
  const firstBill = S.goLive.slice(0, 7) > mon ? billDateOf(prevMonth(S.goLive.slice(0, 7))) : null;
  return { flats: act.length, owing: owe.length, outstanding: owe.reduce((s, o) => s + balance(o), 0), fees: act.reduce((s, o) => s + (o.feeDue || 0), 0),
    flagged: act.filter(o => o.flagged).length, coll, target, pct: target ? Math.round(100 * coll / target) : 0, todo: followCount(), arrears, arrearsOwing, firstBill, ...sheetStats() };
}
export function aging() {
  const k: Record<string, number> = { 'Not yet due': 0, '1–30 days': 0, '31–60 days': 0, '61–90 days': 0, '90+ days': 0, 'Old arrears (before go-live)': 0 };
  const put = (age: number, amt: number) => { if (amt <= 0) return; if (age <= 0) k['Not yet due'] += amt; else if (age <= 30) k['1–30 days'] += amt; else if (age <= 60) k['31–60 days'] += amt; else if (age <= 90) k['61–90 days'] += amt; else k['90+ days'] += amt; };
  for (const o of S.owners) {
    if (o.status !== 'active' || o.exempt) continue;
    if (o.openingLeft > 0) k['Old arrears (before go-live)'] += o.openingLeft;   // already old when the system started
    for (const b of billsOf(o)) put(diff(S.today, b.dueDate), unpaid(b));
  }
  return Object.entries(k);
}
export const monName = () => MONL[+S.today.slice(5, 7) - 1];
