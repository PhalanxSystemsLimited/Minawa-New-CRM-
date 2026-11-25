// The billing engine (Phase 2, 18 Nov 2026: possession-day schedule).
// Each customer is due on their possession day (dueDayOf), or on the 1st when no possession date is on file, once per
// plan period: every 1, 3 (quarterly, existing customers only), 6 or 12 months. A bill covers the period that ends the
// day before its due date (possession 20 Nov, monthly: 20 Nov – 19 Dec, due 20 Dec); the first period is cut at
// go-live and at possession and charged by the day. The bill, and the building manager's "send bill" To do, is made
// `billLead` (15) days before the due date. If it is still unpaid `warnAfter` (15) days after the due date, a late-payment
// warning waits in the building manager's To do; the manager decides at send time whether to add the fine (`feePct`% of
// what is late). Nothing is fined or discontinued automatically: discontinuing maintenance is a manager's request the
// Admin approves. Royal Enclave flats on the Generator list get a separate generator line.
// Go-live (rules.startOn, 25 Nov 2026): every customer with a balance gets a statement for it, due on the 15th of the
// next month, with a late warning `warnAfter` days after that. Monthly charges start in the go-live month
// (Project.goLive, January 2027).
// Promises to pay pause the late warning; payments pay the fine in proportion and dues oldest first.
//
// Engine functions are synchronous and work on one project's State, set with use(). The store loads the
// State, the engine changes it, and the store saves what changed. Messages are only recorded here: staff send
// them by hand from Send on WhatsApp. Payments are entered by staff (building managers' wait for the accountant).
import type { State, Owner, Bill, Message, Handover, Payment, Applied, Target, Breakdown, Proof, LogEntry, BillLine } from './types';
import { PLAN_MONTHS } from './types';
import { addDays, diff, dim, fd, fds, fm, rs, first, fill, MON, MONL, nextMonth, nowPKT, addMonths, monthsBetween, dayIn, periodText } from './fmt';

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
/** Electricity (utility) bills: bills with no maintenance months (Oakwood, 21 Nov 2026). */
export const isUtilBill = (b: Bill) => !b.months && b.lines.some(l => l.kind === 'utility');
export const elecBills = (o: Owner) => billsOf(o).filter(isUtilBill);
/** What the customer still owes on electricity bills; the rest of the balance is maintenance (and earlier dues). */
export const elecDue = (o: Owner) => elecBills(o).reduce((a, b) => a + Math.max(0, b.net - b.paid), 0);
export const promiseOn = (o: Owner, d: string) => !!o.promiseUntil && d <= o.promiseUntil;
export const isAdmin = () => S.role === 'admin';
export const goLive = () => S.goLive;
/** Opening balances (arrears from the accountant's sheet) fall due with the first bill, not on go-live day. */
/** The first bill day: the bill day of the go-live month (billing is for the month just used). */
export const firstBillDate = () => R().startOn || billDateOf(S.goLive.slice(0, 7));
/** Old arrears fall due with the first bill, so nothing is fined or flagged before billing starts. */
export const openingDue = () => dueAfter(firstBillDate(), R().dueDays);
/** Day `day` of the month after date d. */
const dueAfter = (d: string, day: number) => dayIn(nextMonth(d.slice(0, 7)), day);

export const rateTypes = () => [...new Set(S.rates.map(r => r.type))];
export function rateFor(type: string, d: string) {
  let r: { from: string; amount: number } | null = null;
  for (const x of S.rates) if (x.type === type && x.from <= d && (!r || x.from > r.from)) r = x;
  return r ? r.amount : 0;
}
/* Generator charges (21 Nov 2026): one amount a month per building, set by the Admin in Settings › Monthly fees (the
 * rate card row "Generator charges", dated like the others). A flat on the Generator Charges List pays its apartment's
 * fee plus that amount, as two lines on the bill. Before that row existed the building used "<type> + generator" rate
 * cards (Royal Enclave: Apartment 12,000, Apartment + generator 15,000): those still price the months before it.
 * A flat's own agreed rate still wins. Bills store their amounts, so a change only affects bills made after it. */
export const GEN = ' + generator';
export const GEN_FEE = 'Generator charges';
export const genType = (type: string) => type + GEN;
export const isGenType = (type: string) => type.endsWith(GEN) || type === GEN_FEE;
/** The apartment types (no generator rows). */
export const baseTypes = () => rateTypes().filter(t => !isGenType(t) && t !== 'Electricity per unit');
/** Whether this project charges for the generator (and so has a Generator Charges List). */
export const hasGenerator = () => S.rates.some(r => isGenType(r.type) && r.amount > 0);
/** The generator charge a month on day d (for a flat of this type, for the old "+ generator" cards). */
export function genFeeAt(d: string, type?: string): number {
  if (S.rates.some(r => r.type === GEN_FEE && r.from <= d)) return rateFor(GEN_FEE, d);
  const t = type || baseTypes().find(x => S.rates.some(r => r.type === genType(x) && r.from <= d));
  return t && S.rates.some(r => r.type === genType(t) && r.from <= d) ? Math.max(0, rateFor(genType(t), d) - rateFor(t, d)) : 0;
}
/** What this flat pays for the generator a month on day d (0 off the list). */
export const genFee = (o: Owner, d: string) => o.generator ? genFeeAt(d, o.type) : 0;
/** The rate card a flat is billed on (its apartment type; the generator is its own line). */
export function cardType(o: Owner, _d: string) { return o.type; }
export const cardRate = (o: Owner, d: string) => rateFor(o.type, d) + genFee(o, d);
/** What one month of maintenance costs this flat on day d: its own rate, or its rate card (with or without generator). */
export const rateOf = (o: Owner, d: string) => o.rate || cardRate(o, d);
/** Payment amount checks (21 Nov 2026). Above `owed` the entry needs a confirmation (the extra becomes advance credit);
 *  above `cap` it is blocked for building managers and accountants: more than 12 months of this flat's maintenance and
 *  electricity on top of what is owed, or more than Rs 10,00,000. Paying everything owed is always allowed. */
export const PAY_CAP = 1000000;
export function payLimits(o: Owner) {
  const owed = Math.max(0, balance(o)), el = billsOf(o).filter(b => !b.months && b.lines.some(l => l.kind === 'utility')).slice(-3);
  const monthly = (rateOf(o, S.today) || 10000) + (el.length ? Math.round(el.reduce((a, b) => a + b.net, 0) / el.length) : 0);
  return { owed, monthly, cap: Math.max(owed, Math.min(owed + 12 * monthly, PAY_CAP)) };
}
/** Why an amount can't be entered (null when it can). */
export function payBlock(o: Owner, amt: number) {
  const { owed, cap } = payLimits(o);
  if (amt <= cap) return null;
  return `Rs ${amt.toLocaleString('en-US')} is far more than ${o.name} could owe (owes ${rs(owed)}; the most one entry can take is ${rs(cap)}). Check the amount. If it is right, ask the Admin to enter it.`;
}
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
  const sl = nextSlotFor(o, '0000-00-00');
  if (sl) return sl.from.slice(0, 7);
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
/** A customer's billing calendar. day: their billing day of the month. start: the first month charged. off: how many
 *  months a bill comes after the start of the period it is for (new customers 0 or 1, as the first bill is 25 days
 *  after possession). first: the first bill date.
 *  New customer, possession 10 Nov: day 5, start Nov, off 1, first 5 Dec (Nov from the 10th; then 5 Jan for Dec…).
 *  Existing customer, possession 5 Mar 2019: day 5, start Jan 2027 (go-live), off 0, first 5 Jan 2027 (for January).
 *  Existing, no possession date on file: day 25 (billDay), first 25 Jan 2027. */
export function anchorOf(o: Owner) {
  return { day: dueDayOf(o), start: o.possessionKnown ? o.possession.slice(0, 7) : S.goLive.slice(0, 7), off: 0, first: nextSlotFor(o)?.billOn || S.goLive, isNew: !!o.firstBill };
}
/** Before Phase 2 (kept for reference): billing day from firstBill / possession day / the 25th. */
export function anchorOfOld(o: Owner) {
  if (o.firstBill) {
    const start = o.possession.slice(0, 7);
    return { day: +o.firstBill.slice(8), start, off: Math.max(0, monthsBetween(start, o.firstBill.slice(0, 7))), first: o.firstBill, isNew: true };
  }
  const start = [o.possession.slice(0, 7), S.goLive.slice(0, 7)].sort()[1], day = o.possessionKnown ? +o.possession.slice(8) : R().billDay;
  return { day, start, off: 0, first: dayIn(start, day), isNew: false };
}
/** The customer's billing date in month p (their day, or the month's last day). */
export const anchorIn = (o: Owner, p: string) => dayIn(p, anchorOf(o).day);
/** Months to bill on day d (a billing date of this customer): from the first month not billed yet, whole plan
 *  periods up to the period this bill is for. Monthly on 5 Jan: January. Quarterly on 5 Jan: Jan–Mar (then nothing
 *  until 5 Apr). Annual on 5 Jan: the year. New customer possessed 10 Nov: on 5 Dec, November from the 10th. */
export function monthsToBill(o: Owner, d: string) {
  const a = anchorOf(o);
  if (o.possession > d || d < a.first) return [];
  const p = addMonths(d.slice(0, 7), -a.off), n = PLAN_MONTHS[o.plan || 'monthly'] || 1;
  let u = a.start;
  for (let i = 0; i < 120 && covered(o, u); i++) u = nextMonth(u);
  if (u > p) return [];
  const count = Math.ceil((monthsBetween(u, p) + 1) / n) * n, out: string[] = [];
  for (let i = 0, m = u; i < count; i++, m = nextMonth(m)) if (!covered(o, m)) out.push(m);
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
/* ---------- possession-day schedule (Phase 2) ---------- */
/** The day of the month a customer's dues fall due: their possession day, or the 1st with no possession date on file. */
export const dueDayOf = (o: Owner) => o.possessionKnown ? +o.possession.slice(8) : 1;
const planN = (o: Owner) => PLAN_MONTHS[o.plan || 'monthly'] || 1;
const seriesMonth = (o: Owner) => o.possessionKnown ? o.possession.slice(0, 7) : S.goLive.slice(0, 7);
/** The k-th due date (k = 0: the start of the series, the possession date itself). */
export const dueK = (o: Owner, k: number) => k === 0 && o.possessionKnown ? o.possession : dayIn(addMonths(seriesMonth(o), k * planN(o)), dueDayOf(o));
export interface Slot { k: number; from: string; to: string; due: string; billOn: string; days: number; full: number }
/** One billing period: the days it covers (cut at go-live and possession), its due date and the day its bill is made. */
export function slotOf(o: Owner, k: number): Slot | null {
  const start = dueK(o, k - 1), due = dueK(o, k), to = addDays(due, -1);
  let from = start;
  // Customers already on the office lists are charged from go-live (earlier months are in their opening balance);
  // possessions recorded in the CRM (firstBill set) from their possession date.
  if (!o.firstBill && S.goLive > from) from = S.goLive;
  if (o.possessionKnown && o.possession > from) from = o.possession;
  const lb = lastBilled(o); if (lb && lb >= from) from = addDays(lb, 1);
  if (from > to) return null;
  return { k, from, to, due, billOn: addDays(due, -R().billLead), days: diff(due, from), full: Math.max(1, diff(due, start)) };
}
let billKeys: { arr: Bill[]; len: number; set: Set<string>; last: Map<string, string> } | null = null;
function keys() {
  if (!billKeys || billKeys.arr !== S.bills || billKeys.len !== S.bills.length) {
    const last = new Map<string, string>();
    // Bills from before Phase 2 have no covTo: they covered whole calendar months up to periodEnd.
    for (const b of S.bills) { if (!(b.months > 0)) continue; const to = b.covTo || dayIn(b.periodEnd || b.period, 31); if (to > (last.get(b.ownerId) || '')) last.set(b.ownerId, to); }
    billKeys = { arr: S.bills, len: S.bills.length, set: new Set(S.bills.filter(b => b.months > 0).map(b => `${b.ownerId}|${b.dueDate}`)), last };
  }
  return billKeys;
}
/** Whether the period due on `due` is billed already (a set of owner|due date, rebuilt when the bills change). */
const billedSlot = (o: Owner, due: string) => keys().set.has(`${o.id}|${due}`);
/** The last day already billed for this customer: a period never starts before it, so changing a possession date
 *  (and with it the due day) never bills the same days twice. */
const lastBilled = (o: Owner) => keys().last.get(o.id) || null;
/** The first period worth looking at: the one that reaches go-live. */
const firstK = (o: Owner) => o.firstBill ? 1 : Math.max(1, Math.floor(monthsBetween(seriesMonth(o), S.goLive.slice(0, 7)) / planN(o)));
/** Periods whose bill is due to be made on or before day d and isn't made yet (oldest first; catches up missed days). */
export function slotsDue(o: Owner, d: string): Slot[] {
  if (o.status !== 'active' || o.exempt || o.possession > d) return [];
  const out: Slot[] = [];
  for (let k = firstK(o); k < firstK(o) + 400; k++) {
    const due = dueK(o, k);
    if (addDays(due, -R().billLead) > d) break;
    const sl = slotOf(o, k);
    if (sl && !billedSlot(o, sl.due)) out.push(sl);
  }
  return out;
}
/** The next period still to be billed (its bill date may be today or later). */
export function nextSlotFor(o: Owner, from = S.today): Slot | null {
  if (o.status !== 'active') return null;
  const k0 = Math.max(firstK(o), Math.floor(monthsBetween(seriesMonth(o), from.slice(0, 7) < '1900' ? seriesMonth(o) : from.slice(0, 7)) / planN(o)) - 1);
  for (let k = k0; k < k0 + 400; k++) {
    const sl = slotOf(o, k);
    if (sl && !billedSlot(o, sl.due) && sl.billOn >= from) return sl;
  }
  return null;
}
const unbilled = (o: Owner, p: string) => S.charges.filter(c => c.ownerId === o.id && !c.billId && c.amount !== 0 && c.period <= p);
/** The project's first bill day (the default billing day) on or after `from`. */
export function nextBillDate(from: string) { const d = billDateOf(from.slice(0, 7)); return d >= from ? d : billDateOf(nextMonth(from.slice(0, 7))); }
/** The first of this customer's billing dates on or after `from`. */
export function nextAnchor(o: Owner, from: string) { const d = anchorIn(o, from.slice(0, 7)); return d >= from ? d : anchorIn(o, nextMonth(from.slice(0, 7))); }
/** The next date this customer actually gets a maintenance bill (their billing day, plan and go-live taken into account). */
export function nextBillFor(o: Owner) {
  const sl = nextSlotFor(o, S.settings.lastRun === S.today ? addDays(S.today, 1) : S.today);
  if (sl) return sl.billOn;
  let from = S.settings.lastRun === S.today ? addDays(S.today, 1) : S.today;
  for (let i = 0; i < 40; i++) { const d = nextAnchor(o, from); if (o.exempt || monthsToBill(o, d).length) return d; from = addDays(d, 1); }
  return nextAnchor(o, from);
}
/** The soonest bill date across the given customers (or the project's default billing day). */
export function nextBillOf(owners: Owner[], from = S.today) {
  let best: string | null = null;
  for (const o of owners) { if (o.status !== 'active' || o.exempt) continue; const d = nextBillFor(o); if (d >= from && (!best || d < best)) best = d; }
  return best || nextBillDate(from);
}
export function isBillingDay(o: Owner, d: string) {
  if (o.status !== 'active') return false;
  return slotsDue(o, d).length > 0;
}
export function isBillingDayOld(o: Owner, d: string) {
  if (o.status !== 'active') return false;   // months before go-live are never billed (see monthsToBill)
  if (anchorIn(o, d.slice(0, 7)) !== d) return false;
  if (S.bills.some(b => b.ownerId === o.id && b.billDate === d)) return false;
  return (!o.exempt && monthsToBill(o, d).length > 0) || (d >= firstBillDate() && unbilled(o, d.slice(0, 7)).length > 0);
}
/** "November 2026", "Jan – Mar 2027", "2027"; utility-only bills say so. */
/** An electricity (or other utility) bill's kind, from its lines. */
export const utilKind = (b: Bill) => (b.lines.find(l => l.kind === 'utility')?.label.split(',')[0]) || 'Utilities';
export function periodLabel(b: Pick<Bill, 'period' | 'periodEnd' | 'months'> & { covFrom?: string | null; covTo?: string | null }) {
  if (!b.months) return `${fm(b.period)} utilities`;
  if (b.covFrom && b.covTo) return coverLabel(b.covFrom, b.covTo);
  if (b.months === 1 || b.period === b.periodEnd) return fm(b.period);
  const [y1, m1] = [b.period.slice(0, 4), +b.period.slice(5, 7)], [y2, m2] = [b.periodEnd.slice(0, 4), +b.periodEnd.slice(5, 7)];
  if (m1 === 1 && m2 === 12 && y1 === y2) return `Year ${y1}`;
  return y1 === y2 ? `${MON[m1 - 1]} – ${MON[m2 - 1]} ${y2}` : `${MON[m1 - 1]} ${y1} – ${MON[m2 - 1]} ${y2}`;
}
export function periodShort(b: Pick<Bill, 'period' | 'periodEnd' | 'months'> & { covFrom?: string | null; covTo?: string | null }) {
  if (b.months && b.covFrom && b.covTo) return coverLabel(b.covFrom, b.covTo);
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
    const d = billDateOf(p), ct = genFee(o, d) && !o.rate ? genType(o.type) : o.type, card = cardRate(o, d), amt = o.rate || card;
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

export function addEntry(ownerId: string, d: string, kind: string, amount: number, desc: string, extra?: { ref?: string; pid?: string }) {
  S.entries.push({ id: 'E' + nid('e'), ownerId, project: S.project, d, kind, amount, desc, ref: extra?.ref || null, pid: extra?.pid || null });
}

/* ---------- engine ---------- */
/** Makes the bills due on day d: one per period (slotsDue), each with its maintenance, generator and discount lines and
 *  any utility charges entered. With utilitiesOnly, a bill of the entered utility charges alone. Returns the last bill. */
export function createBill(o: Owner, d: string, opts: { utilitiesOnly?: boolean; due?: string } = {}) {
  if (opts.utilitiesOnly) return createBillOld(o, d, opts);
  const slots = slotsDue(o, d);
  if (!slots.length) return createBillOld(o, d, { utilitiesOnly: true });
  let last: Bill | null = null;
  for (const sl of slots) last = createSlotBill(o, sl, d, sl === slots[slots.length - 1]);
  return last!;
}
function createSlotBill(o: Owner, sl: Slot, d: string, withUtilities: boolean) {
  const before = balance(o), n = planN(o), frac = sl.days / sl.full, part = sl.days < sl.full;
  const own = !!o.rate;
  const total = Math.round(rateOf(o, sl.from) * n * frac);
  const gen = own ? 0 : Math.round(genFee(o, sl.from) * n * frac);
  const maint = total - gen, disc = discountFor(o, sl.from, total), cover = coverLabel(sl.from, sl.to);
  const lines: BillLine[] = [{ kind: 'maintenance', label: `Maintenance, ${o.type}, ${cover}${part ? ` (${sl.days} of ${sl.full} days)` : ''}`, amount: maint }];
  if (gen) lines.push({ kind: 'generator', label: `Generator charges, ${cover}`, amount: gen });
  if (disc) lines.push({ kind: 'discount', label: `Discount${o.discount?.kind === 'pct' ? ` (${o.discount.value}%)` : ''}`, amount: -disc });
  const id = 'BL-' + (2600 + nid('bill'));
  let extras = 0;
  const ch = withUtilities ? unbilled(o, d.slice(0, 7)) : [];
  for (const c of ch) { c.billId = id; extras += c.amount; lines.push({ kind: 'utility', label: `${c.kind}, ${fm(c.period)}${c.prevReading != null && c.curReading != null ? ` (meter ${c.prevReading} → ${c.curReading}, ${c.curReading - c.prevReading} units)` : c.units ? ` (${c.units} units)` : ''}${c.note ? ` · ${c.note}` : ''}`, amount: c.amount }); }
  const b: Bill = { id, ownerId: o.id, project: S.project, period: sl.from.slice(0, 7), periodEnd: sl.to.slice(0, 7), months: n, billDate: d,
    dueDate: sl.due, finalDate: addDays(sl.due, R().warnAfter), amount: total, discount: disc, extras, net: total - disc + extras, paid: 0, fine: 0, finePaid: 0,
    fined: false, fromCredit: 0, prev: Math.max(0, before), noticeSkipped: false, flagSkipped: false, reminders: [], lines, bd: null, covFrom: sl.from, covTo: sl.to };
  S.bills.push(b);
  if (total) addEntry(o.id, d, 'bill', total, `Maintenance${gen ? ' + generator' : ''} · ${o.type} · ${cover}`, { ref: b.id });
  if (disc && o.discount) addEntry(o.id, d, 'discount', -disc, o.discount.kind === 'pct' ? `Discount ${o.discount.value}%` : 'Discount (fixed)', { ref: b.id });
  for (const c of ch) addEntry(o.id, d, 'utility', c.amount, `${c.kind} · ${fm(c.period)}`, { ref: b.id });
  if (o.credit > 0) {
    const x = Math.min(o.credit, b.net);
    b.paid += x; b.fromCredit = x; o.credit -= x;
    log(d, '11:00', 'payment', `${rs(x)} of the ${cover} bill for ${o.apt} taken from advance credit`, o.id);
  }
  log(d, '11:00', 'bill', `Bill ${b.id} created for ${o.apt}: ${rs(b.net)} for ${cover}${gen ? ` (incl. ${rs(gen)} generator)` : ''}, due ${fd(b.dueDate)}`, o.id);
  return b;
}
/** "20 Nov – 19 Dec 2026", "1 – 31 Jan 2027", "20 Nov 2026 – 19 May 2027". */
export function coverLabel(from: string, to: string) {
  const y1 = from.slice(0, 4), y2 = to.slice(0, 4), m1 = from.slice(0, 7), m2 = to.slice(0, 7);
  if (m1 === m2) return `${+from.slice(8)} – ${+to.slice(8)} ${MON[+to.slice(5, 7) - 1]} ${y2}`;
  return y1 === y2 ? `${fds(from)} – ${fds(to)} ${y2}` : `${fds(from)} ${y1} – ${fds(to)} ${y2}`;
}
function createBillOld(o: Owner, d: string, opts: { utilitiesOnly?: boolean; due?: string } = {}) {
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
  for (const c of ch) { c.billId = id; extras += c.amount; lines.push({ kind: 'utility', label: `${c.kind}, ${fm(c.period)}${c.prevReading != null && c.curReading != null ? ` (meter ${c.prevReading} → ${c.curReading}, ${c.curReading - c.prevReading} units)` : c.units ? ` (${c.units} units)` : ''}${c.note ? ` · ${c.note}` : ''}`, amount: c.amount }); }
  const b: Bill = { id, ownerId: o.id, project: S.project, period: months[0] || p, periodEnd: months[months.length - 1] || p, months: months.length, billDate: d,
    dueDate: opts.due || dueFor(o, d), finalDate: addDays(opts.due || dueFor(o, d), R().warnAfter), amount, discount: disc, extras, net: amount - disc + extras, paid: 0, fine: 0, finePaid: 0,
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
/** An owner's instalment plan for old arrears, part by part: what each part still needs, and whether it is late.
 *  Payments reach old arrears as always; the parts are filled in order from how far the arrears have come down. */
export function instalmentStatus(o: Owner, d = S.today) {
  const p = o.instalments;
  if (!p) return null;
  let paid = Math.max(0, p.startLeft - (o.openingLeft || 0));
  const items = p.items.map((x, i) => {
    const got = Math.min(x.amount, paid); paid -= got;
    const left = x.amount - got, state = left <= 0 ? 'paid' : d > x.due ? 'overdue' : 'due';
    return { n: i + 1, amount: x.amount, due: x.due, paid: got, left, state: state as 'paid' | 'overdue' | 'due' };
  });
  const overdue = items.filter(x => x.state === 'overdue').reduce((a, x) => a + x.left, 0), next = items.find(x => x.state !== 'paid') || null;
  return { plan: p, items, overdue, next, done: !next };
}
const instOverdue = (o: Owner, d: string) => instalmentStatus(o, d)?.overdue || 0;
/** A bill's due date: the owner's own due day in the month after the bill (approved by an Admin), or the project's rule. */
export function dueFor(o: Owner, billDate: string) { return dueAfter(billDate, o.dueDay || R().dueDays); }
export const duesOf = (o: Owner) => (o.openingLeft || 0) + billsOf(o).reduce((s, b) => s + Math.max(0, b.net - b.paid), 0);
const isLate = (o: Owner, d: string) => (o.openingLeft > 0 && (o.instalments ? instOverdue(o, d) > 0 : d > openingDue())) || billsOf(o).some(b => unpaidMaint(b) > 0 && d > b.dueDate);
/** What the fine is a % of: unpaid bills, plus old arrears only when the project fines them (rules.fineArrears). */
// With an instalment plan, only the parts that are late are fined (the rest of the arrears isn't due yet).
export const fineBase = (o: Owner) => (o.instalments ? instOverdue(o, S.today) : R().fineArrears ? o.openingLeft || 0 : 0) + billsOf(o).reduce((s, b) => s + Math.max(0, b.net - b.paid), 0);
const fineLate = (o: Owner, d: string) => (o.instalments ? instOverdue(o, d) > 0 : false) || (R().fineArrears ? isLate(o, d) : billsOf(o).some(b => unpaidMaint(b) > 0 && d > b.dueDate));
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
function allocate(o: Owner, amt: number, prefer?: 'electricity', billId?: string | null, range?: [string, string]): Applied[] {
  // 26 Nov 2026: a payment for certain months (a payment request) pays those months' bills first; old dues from
  // before the CRM come first only when the months asked for go back that far.
  const inR = (b: Bill) => !!range && (prefer === 'electricity' ? !b.months : b.months > 0) && !((b.periodEnd || b.period) < range[0] || b.period > range[1]);
  const arrFirst = !range || range[0] < goLive().slice(0, 7);
  let left = amt;
  const out: Applied[] = [];
  const put = (kind: Applied['kind'], label: string, x: number, ref?: string) => { if (x <= 0) return; const r = out.find(y => y.label === label); if (r) r.amount += x; else out.push({ kind, label, amount: x, ...(ref ? { ref } : {}) }); };
  const dues = duesOf(o), fee = o.feeDue || 0, feeL = `Fine (${feePct()}%)`;
  // A payment for certain months pays those months in full first; any fine is paid from what is left over.
  const toFee = range ? 0 : dues > 0 ? Math.min(fee, Math.round(amt * fee / (dues + fee))) : Math.min(fee, amt);
  o.feeDue = fee - toFee; left -= toFee; put('fee', feeL, toFee, 'fee');
  const arrL = `Earlier dues (before ${fm(goLive().slice(0, 7))})`;
  if (o.instalments && o.openingLeft > 0) {
    // On an instalment plan: late instalments first, then the monthly bills (so they stay paid as usual), and the
    // instalments not yet due only after that. One arrears balance, never counted twice.
    const late = Math.min(left, instOverdue(o, S.today), o.openingLeft);
    if (late > 0) { o.openingLeft -= late; left -= late; put('dues', `${arrL}, late instalments`, late, 'arrears'); }
  } else if (o.openingLeft > 0 && arrFirst) { const x = Math.min(left, o.openingLeft); o.openingLeft -= x; left -= x; put('dues', arrL, x, 'arrears'); }
  // A payment marked for electricity (Oakwood) pays the electricity bills first, oldest first.
  let order = prefer === 'electricity' ? [...billsOf(o).filter(b => !b.months), ...billsOf(o).filter(b => b.months)] : billsOf(o);
  // "Bill received" for one electricity bill (21 Nov 2026): that bill first.
  if (billId) { const t = order.find(b => b.id === billId); if (t) order = [t, ...order.filter(b => b !== t)]; }
  if (range) order = [...order.filter(inR), ...order.filter(b => !inR(b))];
  for (const b of order) { if (left <= 0) break; const x = Math.min(left, b.net - b.paid); if (x > 0) { b.paid += x; left -= x; put('dues', `${b.months ? 'Maintenance' : utilKind(b)}, ${periodLabel(b)}`, x, b.id); } }
  if (!o.instalments && o.openingLeft > 0 && left > 0) { const x = Math.min(left, o.openingLeft); o.openingLeft -= x; left -= x; put('dues', arrL, x, 'arrears'); }
  if (o.instalments && o.openingLeft > 0 && left > 0) { const x = Math.min(left, o.openingLeft); o.openingLeft -= x; left -= x; put('dues', `${arrL}, instalments ahead of time`, x, 'arrears'); }
  if (left > 0 && o.feeDue > 0) { const x = Math.min(left, o.feeDue); o.feeDue -= x; left -= x; put('fee', feeL, x, 'fee'); }
  if (left > 0) { o.credit += left; put('credit', 'Kept as advance credit', left, 'credit'); }
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
type MsgIn = Partial<Message> & { kind: string; title: string; text: string };
/** Queue an electricity bill reminder (the daily run 3 days after the due date, or the building manager from the
 *  Electricity bills screen). Returns false when the bill is paid or a reminder for it is already waiting. */
export function elecReminder(o: Owner, b: Bill, d: string, t: string, tag = 0) {
  if (b.net - b.paid <= 0 || S.messages.some(m => m.status === 'pending' && m.tpl === 'elec' && m.pdf?.id === b.id)) return false;
  // tag: which of the Admin's reminder days this is (1, 2…); 0 for one sent by hand (21 Nov 2026).
  b.reminders = [...(b.reminders || []), tag];
  pushMsg(o, d, t, { kind: 'reminder', title: `${utilKind(b)} reminder · ${fm(b.period)}`, tpl: 'elec', pdf: { kind: 'bill', id: b.id }, text: '' });
  return true;
}
export function pushMsg(o: Owner, d: string, t: string, m: MsgIn) {
  const msg: Message = { id: 'M' + nid('msg'), ownerId: o.id, project: S.project, d, t, from: 'biz', tpl: null, vars: null, pdf: null,
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
    const bd = b.bd = duesBreakdown(o);
    const vars = { name: first(o.name), apt: o.apt, month: periodLabel(b), amount: rs(b.net), ...bdVars(bd), total: rs(bal), due: fd(b.dueDate) };
    pushMsg(o, d, t, { kind: 'bill', title: `Bill · ${periodLabel(b)}`, text: fill(S.templates.bill.text, vars), tpl: 'bill', vars, pdf: { kind: 'bill', id: b.id } });
  }
  if (!o.invalidPhone) log(d, t, 'message', `Bill for ${periodLabel(b)} ready to send to ${o.apt} (Send on WhatsApp)`, o.id);
}
function sendNotice(o: Owner, b: Bill, d: string, newBill?: Bill) {
  const bal = balance(o), t = '11:00';
  const bd = (newBill || b).bd = duesBreakdown(o);
  const vars = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal), month: periodLabel(b), final: fd(b.finalDate) };
  let text = fill(S.templates.notice.text, vars);
  if (newBill) text += `\n\nThis total includes your new ${periodLabel(newBill)} bill.`;
  pushMsg(o, d, t, { kind: 'notice', title: 'Late payment warning', text, tpl: 'notice', vars, pdf: { kind: 'bill', id: (newBill || b).id } });
  if (!o.invalidPhone) log(d, t, 'message', `Late payment warning ready to send to ${o.apt}: ${rs(bal)} unpaid since ${fd(b.dueDate)} (the accountant decides on the fine when sending it)`, o.id);
}
// A friendly reminder before the due date.
function sendReminder(o: Owner, b: Bill, d: string) {
  const bal = balance(o), t = '11:00';
  if (bal <= 0) return;
  const bd = duesBreakdown(o);
  const vars = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal), due: fd(b.dueDate) };
  pushMsg(o, d, t, { kind: 'reminder', title: 'Reminder', text: fill(S.templates.reminder.text, vars), tpl: 'reminder', vars, pdf: { kind: 'statement', id: o.id } });
  if (!o.invalidPhone) log(d, t, 'message', `Reminder ready to send to ${o.apt}: ${rs(bal)} due ${fd(b.dueDate)}`, o.id);
}
// Go-live: the statement of what a customer owes, and the final notice for old arrears left unpaid after it.
function sendStatement(o: Owner, d: string) {
  const bal = balance(o), t = '11:00';
  if (bal <= 0) return;
  const bd = duesBreakdown(o), due = openingDue();
  const vars = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal), due: fd(due) };
  pushMsg(o, d, t, { kind: 'bill', title: 'Statement · dues to date', text: fill(S.templates.reminder.text, vars), tpl: 'reminder', vars, pdf: { kind: 'statement', id: o.id } });
  log(d, t, 'bill', `Statement for ${o.apt}: ${rs(bal)} owed at go-live, due ${fd(due)}`, o.id);
  if (!o.invalidPhone) log(d, t, 'message', `Statement ready to send to ${o.apt} (Send on WhatsApp)`, o.id);
}
function sendOpeningNotice(o: Owner, d: string) {
  const bal = balance(o), t = '11:00', final = addDays(openingDue(), R().flagDays);
  if (bal <= 0) return;
  const bd = duesBreakdown(o);
  const vars = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal), month: 'earlier dues', final: fd(final) };
  pushMsg(o, d, t, { kind: 'notice', title: 'Late payment warning', text: fill(S.templates.notice.text, vars), tpl: 'notice', vars, pdf: { kind: 'statement', id: o.id } });
  if (!o.invalidPhone) log(d, t, 'message', `Late payment warning ready to send to ${o.apt}: ${rs(bal)} of earlier dues unpaid since ${fd(openingDue())}`, o.id);
}
function sendOpeningReminder(o: Owner, d: string) {
  const bal = balance(o), t = '11:00';
  if (bal <= 0) return;
  const bd = duesBreakdown(o), due = openingDue();
  const vars = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal), due: fd(due) };
  pushMsg(o, d, t, { kind: 'reminder', title: 'Reminder', text: fill(S.templates.reminder.text, vars), tpl: 'reminder', vars, pdf: { kind: 'statement', id: o.id } });
  if (!o.invalidPhone) log(d, t, 'message', `Reminder ready to send to ${o.apt}: ${rs(bal)} due ${fd(due)}`, o.id);
}
function flag(o: Owner, d: string) {
  o.flagged = true; o.flaggedOn = d;
  log(d, '11:00', 'flag', `${o.apt} flagged for disconnection: ${rs(balance(o))} unpaid after the final deadline`, o.id);
}
/** A reminder for this bill today: today is one of the reminder days (3rd, 7th) of the due date's month, after the
 *  bill and before its due date, and it hasn't had that reminder yet. */
export function remindToday(b: Bill, d: string) {
  const dom = +d.slice(8);
  return R().remindOn.includes(dom) && d.slice(0, 7) === b.dueDate.slice(0, 7) && d > b.billDate && d < b.dueDate && !b.reminders.includes(dom);
}
/** Old arrears (the balance at go-live): the go-live statement, reminders in the due month, then a final notice the
 *  day after the due date and a flag `flagDays` later. Customers on an approved instalment plan follow the plan. */
const openingOwed = (o: Owner) => !o.instalments && (o.openingLeft || 0) > 0;
export function openingEvent(o: Owner, d: string): 'statement' | 'remind' | 'notice' | 'flag' | null {
  const st = R().startOn;
  if (!st || o.status !== 'active' || o.exempt) return null;
  if (d === st) return balance(o) > 0 ? 'statement' : null;
  if (!openingOwed(o) || d < st) return null;
  if (d === addDays(openingDue(), R().warnAfter)) return 'notice';   // late-payment warning for old arrears
  return null;
}
/* ---------- "apply to the current bill" (Phase 2) ---------- */
/** The customer's current bill: the latest maintenance bill still not fully paid (or, if all are paid, none). */
export const currentBill = (o: Owner) => [...billsOf(o)].reverse().find(b => b.months > 0 && b.net - b.paid > 0) || null;
/** What a bill's maintenance (with generator, less discount) comes to with today's settings; `at` = the date whose
 *  rates count (the bill's own start by default). */
export function billCharge(o: Owner, b: Bill, at?: string) {
  const from = b.covFrom || `${b.period}-01`, n = b.months || 1;
  // A first or last part-period keeps its share ("13 of 31 days" on the maintenance line).
  const m = /\((\d+) of (\d+) days\)/.exec(b.lines.find(l => l.kind === 'maintenance')?.label || ''), part = m ? +m[1] / +m[2] : 1;
  const d = at && at > from ? at : from;
  const total = Math.round(rateOf(o, d) * n * part);
  return total - discountFor(o, d, total);
}
/** Brings the current bill in line with a change approved "for the current bill": a correction line (and account
 *  entry) for the difference; the bill as first issued stays readable. Returns the difference. */
export function correctCurrentBill(o: Owner, reason: string, d: string, t: string, by: string, at?: string) {
  const b = currentBill(o); if (!b) return 0;
  const corr = b.lines.filter(l => l.kind === 'correction').reduce((a, l) => a + l.amount, 0);
  const delta = billCharge(o, b, at) - (b.amount - b.discount + corr);
  if (!delta) return 0;
  b.lines.push({ kind: 'correction', label: `Correction ${fds(d)}: ${reason}`, amount: delta });
  b.net += delta;
  if (b.net < b.paid) { o.credit += b.paid - b.net; b.paid = b.net; }
  addEntry(o.id, d, 'adjustment', delta, `Current bill corrected by ${by}: ${reason}`, { ref: b.id });
  log(d, t, 'bill', `Bill ${b.id} for ${o.apt} corrected by ${rs(delta)} (${reason}), approved by ${by}`, o.id);
  return delta;
}

/* ---------- a customer leaving (Phase 3) ---------- */
/** What leaving on day L means for the account: maintenance for the days up to L not billed yet, credit for days
 *  already billed after L, and what is left to pay. The customer can only leave once `due` is 0 or less. */
export function leaveFigures(o: Owner, L: string) {
  const n = planN(o);
  let unbilled = 0, uFrom: string | null = null, uTo: string | null = null;
  const to = addDays(L, -1);
  for (let k = firstK(o); k < firstK(o) + 400; k++) {
    const sl = slotOf(o, k); if (!sl) { if (dueK(o, k) > L) break; continue; }
    if (sl.from > to) break;
    const end = sl.to < to ? sl.to : to, days = diff(addDays(end, 1), sl.from);
    if (days <= 0) continue;
    const amt = Math.round(rateOf(o, sl.from) * n * days / sl.full);
    unbilled += amt - discountFor(o, sl.from, amt); uFrom = uFrom || sl.from; uTo = end;
  }
  const unused: { b: Bill; days: number; amount: number }[] = [];
  for (const b of billsOf(o)) {
    if (!b.months || !b.covFrom || !b.covTo || b.covTo < L) continue;
    const all = diff(addDays(b.covTo, 1), b.covFrom), start = L > b.covFrom ? L : b.covFrom, days = diff(addDays(b.covTo, 1), start);
    if (days > 0 && all > 0) unused.push({ b, days, amount: Math.round((b.amount - b.discount) * days / all) });
  }
  const credit = unused.reduce((a, x) => a + x.amount, 0), bal = balance(o);
  return { balance: bal, unbilled, uFrom, uTo, unused, credit, due: bal + unbilled - credit };
}
/** The customer leaves on day L (approved by the Admin): a final bill for the days not billed yet, credit for days
 *  billed after L, the leaving meter reading, the Dues Clearance certificate, and the apartment is vacant (no bills). */
export function finalizeLeave(o: Owner, L: string, reading: number | null, d: string, t: string, by: string) {
  const f = leaveFigures(o, L);
  if (f.due > 0) throw new Error(`Charges are not cleared. Please clear all charges first: ${rs(f.due)} still to pay.`);
  if (f.unbilled > 0 && f.uFrom && f.uTo) {
    const id = 'BL-' + (2600 + nid('bill')), cover = coverLabel(f.uFrom, f.uTo);
    const b: Bill = { id, ownerId: o.id, project: S.project, period: f.uFrom.slice(0, 7), periodEnd: f.uTo.slice(0, 7), months: planN(o), billDate: d, dueDate: d, finalDate: d,
      amount: f.unbilled, discount: 0, extras: 0, net: f.unbilled, paid: 0, fine: 0, finePaid: 0, fined: true, fromCredit: 0, prev: Math.max(0, balance(o)), noticeSkipped: false, flagSkipped: false,
      reminders: [], lines: [{ kind: 'maintenance', label: `Final maintenance, ${cover} (until leaving on ${fds(L)})`, amount: f.unbilled }], bd: null, covFrom: f.uFrom, covTo: f.uTo };
    S.bills.push(b);
    addEntry(o.id, d, 'bill', f.unbilled, `Final maintenance · ${cover}`, { ref: id });
    if (o.credit > 0) { const x = Math.min(o.credit, b.net); b.paid += x; b.fromCredit = x; o.credit -= x; }
  }
  for (const u of f.unused) {
    u.b.lines.push({ kind: 'correction', label: `Credit for ${u.days} day${u.days === 1 ? '' : 's'} after leaving on ${fds(L)}`, amount: -u.amount });
    u.b.net -= u.amount;
    if (u.b.net < u.b.paid) { o.credit += u.b.paid - u.b.net; u.b.paid = u.b.net; }
    addEntry(o.id, d, 'adjustment', -u.amount, `Credit: ${u.days} day${u.days === 1 ? '' : 's'} billed after leaving on ${fds(L)}`, { ref: u.b.id });
  }
  o.status = 'closed'; o.closedOn = L; o.flagged = false; o.promiseUntil = null;
  if (reading != null) o.meterOut = { d: L, reading };
  let c = S.clearances.find(x => x.ownerId === o.id);
  if (!c) { c = { no: 'DC-' + d.slice(0, 4) + '-' + String(nid('dc')).padStart(3, '0'), ownerId: o.id, project: S.project, d, by }; S.clearances.push(c); }
  const left = balance(o);
  log(d, t, 'admin', `${o.name} left ${o.apt} on ${fd(L)}${reading != null ? ` (meter ${reading})` : ''}: all charges cleared, clearance ${c.no}${left < 0 ? `, ${rs(-left)} advance to refund` : ''}. ${o.apt} is vacant and not billed until the next possession. Approved by ${by}`, o.id);
  return { clearance: c.no, refund: Math.max(0, -left) };
}

/* ---------- the fine, added by hand (Phase 2) ---------- */
/** What is late on day d: unpaid bills past their due date, and old arrears past theirs when the project fines them. */
export function lateBase(o: Owner, d = S.today) {
  const bills = billsOf(o).filter(b => b.dueDate < d).reduce((a, b) => a + Math.max(0, b.net - b.paid), 0);
  const arrears = R().fineArrears && (o.openingLeft || 0) > 0 && (o.instalments ? true : d > openingDue()) ? (o.instalments ? instOverdue(o, d) : o.openingLeft) : 0;
  return bills + arrears;
}
/** The fine the building manager can add when sending a late warning or a reminder: feePct% of what is late. */
export const fineOffer = (o: Owner, d = S.today) => Math.max(0, Math.round(lateBase(o, d) * feePct() / 100) - (o.feeDue || 0));
export function addFine(o: Owner, d: string, t: string, by: string) {
  const base = lateBase(o, d), add = fineOffer(o, d);
  if (add <= 0) return 0;
  o.feeDue = (o.feeDue || 0) + add;
  addEntry(o.id, d, 'fine', add, `Fine added by ${by}: ${feePct()}% of ${rs(base)} late`);
  log(d, t, 'fine', `Fine of ${rs(add)} added to ${o.apt} by ${by} (${feePct()}% of ${rs(base)} late)`, o.id);
  return add;
}
/** Takes back a fine added by mistake (only the part not paid yet). */
export function removeFine(o: Owner, d: string, t: string, by: string) {
  const x = o.feeDue || 0;
  if (x <= 0) return 0;
  o.feeDue = 0;
  addEntry(o.id, d, 'fine', -x, `Fine removed by ${by}`);
  log(d, t, 'fine', `Fine of ${rs(x)} removed from ${o.apt} by ${by}`, o.id);
  return x;
}
export function runDaily(d: string) {
  const c = { bills: 0, fines: 0, notices: 0, flags: 0, alerts: 0, paused: 0, reminders: 0, statements: 0 };
  if (d.slice(8) === '01') setTarget(d.slice(0, 7), d);
  const out = new Map<string, { bill?: Bill; notice?: Bill; statement?: boolean; oNotice?: boolean }>();
  const box = (id: string) => { if (!out.has(id)) out.set(id, {}); return out.get(id)!; };
  for (const o of S.owners) {
    if (o.status !== 'active' || o.exempt) continue;
    // Bills: 15 days before each due date (all periods whose bill day has come, so missed days catch up).
    if (slotsDue(o, d).length) { box(o.id).bill = createBill(o, d); c.bills++; }
    const oe = openingEvent(o, d);
    if (oe === 'statement') { box(o.id).statement = true; c.statements++; }
    else if (oe === 'notice') {
      if (promiseOn(o, d)) { c.paused++; log(d, '11:00', 'job', `Late warning for ${o.apt} (earlier dues) paused: promise to pay until ${fd(o.promiseUntil!)}`, o.id); }
      else box(o.id).oNotice = true;
    }
    // Late-payment warning: 15 days after the due date if still unpaid (the manager decides on the fine when sending).
    for (const b of billsOf(o)) {
      if (!b.fined && b.months > 0 && b.finalDate <= d && unpaidMaint(b) > 0) {
        b.fined = true;
        if (promiseOn(o, d)) { b.noticeSkipped = true; c.paused++; log(d, '11:00', 'job', `Late warning for ${o.apt} paused: promise to pay until ${fd(o.promiseUntil!)}`, o.id); }
        else box(o.id).notice = b;
      }
    }
    if (o.promiseUntil && addDays(o.promiseUntil, 1) === d) {
      const was = o.promiseUntil; o.promiseUntil = null;
      if (balance(o) > 0) {
        S.alerts.push({ id: 'AL' + nid('al'), ownerId: o.id, project: S.project, d, text: `Promise to pay by ${fd(was)} not kept. ${rs(balance(o))} still owed.`, done: false });
        log(d, '11:00', 'alert', `Promise to pay broken: ${o.apt} still owes ${rs(balance(o))}. The accountant is alerted; the late warning resumes`, o.id);
        c.alerts++;
        const sk = billsOf(o).filter(b => b.noticeSkipped && unpaid(b) > 0);
        if (sk.length) { box(o.id).notice = sk[sk.length - 1]; sk.forEach(b => { b.noticeSkipped = false; }); }
      }
    }
  }
  for (const [id, x] of out) {
    const o = ownerById(id);
    if (x.notice) { sendNotice(o, x.notice, d, x.bill); c.notices++; }
    else if (x.oNotice) { sendOpeningNotice(o, d); c.notices++; }
    else if (x.bill) sendBill(o, x.bill, d);
    else if (x.statement) sendStatement(o, d);
  }
  // Electricity bills: reminders of their own on the Admin's days relative to the due date (Settings › Electricity;
  // first rule: 3 days after), while unpaid, separate from the maintenance reminders and warnings. One a day at most;
  // more can be sent from the Electricity bills screen.
  const offs = (() => { const l = Array.isArray(R().elecRemind) ? R().elecRemind!.map(Number).filter(n => Number.isFinite(n) && n >= -30 && n <= 90) : [3]; return [...new Set(l.length ? l : [3])].sort((a, b) => a - b); })();
  for (const o of S.owners) {
    if (o.status !== 'active') continue;
    for (const b of elecBills(o)) {
      const due = offs.filter(n => addDays(b.dueDate, n) <= d).length, sent = (b.reminders || []).filter(x => x > 0).length;
      if (b.net - b.paid <= 0 || sent >= due) continue;
      if (promiseOn(o, d)) { c.paused++; continue; }
      if (!elecReminder(o, b, d, '11:00', sent + 1)) continue;
      c.reminders++;
      log(d, '11:00', 'job', `${utilKind(b)} bill reminder for ${o.apt} (${fm(b.period)}, ${rs(b.net - b.paid)} unpaid) ready to send`, o.id);
    }
  }
  log(d, '11:00', 'job', `Daily run: ${c.statements ? `${c.statements} go-live statement(s), ` : ''}${c.bills} bill(s), ${c.reminders ? `${c.reminders} electricity reminder(s), ` : ''}${c.notices} late warning(s)${c.paused ? `, ${c.paused} paused by promise` : ''}${c.alerts ? `, ${c.alerts} promise alert(s)` : ''}`);
  return c;
}
export function recordPayment(o: Owner, amt: number, method: string, ref: string | null, d: string, source: Payment['source'], t: string, by: string, extra?: Partial<Payment>, opts: { holdReceipt?: boolean } = {}) {
  const pid = 'PAY-' + (1000 + nid('pay')), before = balance(o);
  addEntry(o.id, d, 'payment', -amt, `Payment · ${method}`, { ref: ref || pid, pid });
  const applied = allocate(o, amt, extra?.forWhat === 'electricity' ? 'electricity' : undefined, extra?.billId, extra?.periodFrom ? [extra.periodFrom, extra.periodTo || extra.periodFrom] : undefined);
  const bal = balance(o);
  const p: Payment = { id: pid, ownerId: o.id, project: S.project, d, t, amount: amt, method, ref: ref || pid, source, by: by || 'Provider', before, applied, balAfter: bal,
    receipt: 'RC-' + d.slice(0, 4) + '-' + String(nid('rc' + d.slice(0, 4))).padStart(4, '0'), ...(extra || {}) };
  S.payments.push(p);
  log(d, t, 'payment', `${rs(amt)} recorded for ${o.apt} · ${method} · by ${p.by}. Allocated to oldest dues first`, o.id);
  if (bal <= 0 && o.flagged) {
    o.flagged = false;
    const susp = o.suspensions.some(s => !s.to);
    log(d, t, 'flag', `${o.apt} flag cleared: all dues paid${susp ? '. Restore suspended services' : ''}`, o.id);
  }
  // 26 Nov 2026: a payment from a payment request gets its receipt only once the accountant approves it.
  if (!opts.holdReceipt) receiptMsg(o, p, d, t);
  return p;
}
/** The customer's receipt for a payment, waiting in Receipts to send. */
export function receiptMsg(o: Owner, p: Payment, d: string, t: string) {
  const bal = p.balAfter;
  const vars = { name: first(o.name), paid: rs(p.amount), apt: o.apt, date: fd(p.d), balance: bal > 0 ? rs(bal) : bal < 0 ? `Rs 0 (credit ${rs(-bal)})` : 'Rs 0', period: p.periodFrom ? periodText(p.periodFrom, p.periodTo) : '' };
  pushMsg(o, d, t, { kind: 'receipt', title: 'Payment received', text: fill(S.templates.receipt.text, vars), tpl: 'receipt', vars, pdf: { kind: 'receipt', id: p.id } });
}
export function ownerProof(o: Owner, amt: number, d: string, t: string, media?: string | null, text?: string) {
  const m = pushMsg(o, d, t, { from: 'owner', kind: 'reply', title: 'Owner reply', shot: true, text: text || `Paid ${rs(amt)} by bank transfer to Minawa Group's account. Screenshot attached.` });
  const pr: Proof = { id: 'PR' + nid('pr'), ownerId: o.id, project: S.project, d, t, amount: amt, status: 'pending', msgId: m.id, doneOn: null, media: media || null };
  S.proofs.push(pr);
  log(d, t, 'message', `Screenshot from ${o.apt} received on WhatsApp and added to To do (${rs(amt)})`, o.id);
  return pr;
}
export function verifyProof(p: Proof, d: string, t: string, by: string, amount?: number, hold?: Payment[]) {
  const o = ownerById(p.ownerId);
  if (p.kind === 'cash' && p.payId && !S.payments.some(x => x.id === p.payId && !x.reversed)) throw new Error('The payment from this entry was already taken back.');
  const before = p.amount;
  if (amount && amount > 0) p.amount = amount;
  p.status = 'verified'; p.doneOn = d; p.checkedBy = by;
  if (p.kind === 'cash') {
    const m = p.method || 'Cash', bank = m === 'Bank transfer';
    // Since 19 Nov 2026 the payment (balance, receipt) was recorded when the building manager entered it: approving only
    // confirms the money reached the Accountant (cash in his hand, or the transfer seen in Minawa's bank account). Nothing
    // new goes to the customer, unless the Accountant corrected the amount: then the payment is recorded again with
    // the right amount and the corrected receipt waits in the building manager's Receipts.
    let pay = p.payId ? S.payments.find(x => x.id === p.payId && !x.reversed) : undefined;
    if (pay && p.amount !== before) {
      reversePayment(o, pay, `Amount corrected by ${by} on approval: ${rs(before)} → ${rs(p.amount)}`, by, d, t, true);
      pay = entryPayment(o, p, d, t);
      log(d, t, 'payment', `${by} approved the entry for ${o.apt} with the amount corrected to ${rs(p.amount)}. A corrected receipt is ready to send`, o.id);
    }
    if (pay) {
      pay.approvedBy = by; pay.approvedAt = `${d} ${t}`;
      log(d, t, 'payment', `${by} confirmed ${rs(pay.amount)} ${bank ? 'bank transfer' : 'cash'} for ${o.apt} (receipt ${pay.receipt}, entered by ${p.byName || 'the building manager'})${bank ? '' : ': the cash is with the Accountant'}`, o.id);
    } else {
      // An entry made before 19 Nov 2026: only now does it count (receipt, balance, message to the owner).
      pay = recordPayment(o, p.amount, `${m}${p.paidOn && p.paidOn !== d ? ` (paid ${fd(p.paidOn)})` : ''}`, p.ref || p.txn || `${m} #${p.id}`, d, 'staff', t, `${p.byName || 'Building manager'}, approved by ${by}`,
        { collectorId: bank ? null : p.byId || null, collectorName: bank ? null : p.byName || 'Building manager', enteredBy: p.byName || 'Building manager', approvedBy: by, approvedAt: `${d} ${t}`, txn: p.txn || null, forWhat: p.forWhat || null, entryId: p.id, periodFrom: p.periodFrom || null, periodTo: p.periodTo || null });
      p.payId = pay.id;
    }
    if (!bank) { if (hold) hold.push(pay); else receiveCash([pay], by, d, t); }
    // 26 Nov 2026: an entry for a payment request: the receipt goes to the customer now, from the accountant's To do.
    if (p.requestId) receiptMsg(o, pay, d, t);
    return pay;
  }
  return recordPayment(o, p.amount, 'Bank transfer (screenshot checked)', 'Proof #' + p.id, d, 'proof', t, by);
}
/** The payment a building manager's entry makes at once: the balance changes and the receipt waits in his Receipts. */
function entryPayment(o: Owner, p: Proof, d: string, t: string) {
  const m = p.method || 'Cash', bank = m === 'Bank transfer';
  const pay = recordPayment(o, p.amount, `${m}${p.paidOn && p.paidOn !== d ? ` (paid ${fd(p.paidOn)})` : ''}`, p.ref || p.txn || `${m} #${p.id}`, d, 'staff', t, p.byName || 'Building manager',
    { collectorId: bank ? null : p.byId || null, collectorName: bank ? null : p.byName || 'Building manager', enteredBy: p.byName || 'Building manager', approvedBy: null, approvedAt: null, txn: p.txn || null, forWhat: p.forWhat || null, entryId: p.id, periodFrom: p.periodFrom || null, periodTo: p.periodTo || null, photoId: p.photoId || null, billId: p.billId || null }, { holdReceipt: !!p.requestId });
  p.payId = pay.id;
  return pay;
}
/** A payment whose building manager's entry the Accountant hasn't approved yet: it counts for the customer, but the
 *  money is still with the building manager (not "in hand to hand over": approving it is the hand-over). */
export const awaitingApproval = (p: Payment) => !!p.entryId && S.proofs.some(x => x.id === p.entryId && x.status === 'pending');
/** Approved cash is with the Accountant: one received hand-over per building manager per approval batch, so the
 *  Cash page's bank deposit list stays short. */
export function receiveCash(pays: Payment[], by: string, d: string, t: string) {
  const groups = new Map<string, Payment[]>();
  for (const p of pays) if (p.collectorId && !p.handoverId) groups.set(p.collectorId, [...(groups.get(p.collectorId) || []), p]);
  for (const [id, list] of groups) {
    const h: Handover = { id: 'HO-' + (100 + nid('ho')), project: S.project, fromId: id, fromName: list[0].collectorName || 'Building manager', amount: list.reduce((a, p) => a + p.amount, 0), paymentIds: list.map(p => p.id), d, t,
      status: 'received', receivedBy: by, receivedD: d, note: 'Received when the entries were approved', reply: null, depositSlip: null, depositD: null, depositedBy: null };
    S.handovers.push(h); list.forEach(p => { p.handoverId = h.id; });
  }
}
/** A building manager enters a payment he received (cash, or a bank transfer into Minawa's account with its transaction
 *  ID). Since 19 Nov 2026 it counts at once: the balance changes and the receipt waits in his Receipts to send to the
 *  customer straight away. The entry also waits for the Accountant, whose approval confirms the money reached him
 *  (verifyProof); "not received" takes the payment back (rejectProof). */
export const MANAGER_METHODS = ['Cash', 'Bank transfer'];
export function recordCash(o: Owner, amount: number, paidOn: string, ref: string, note: string, d: string, t: string, byId: string | null, byName: string, method = 'Cash', txn = '', forWhat: 'maintenance' | 'electricity' | null = null, more: { photoId?: string | null; billId?: string | null; periodFrom?: string | null; periodTo?: string | null; requestId?: string | null } = {}) {
  const pr: Proof = { id: 'PR' + nid('pr'), ownerId: o.id, project: S.project, d, t, amount, status: 'pending', msgId: null, doneOn: null, media: null,
    kind: 'cash', method, ref: ref || null, note: note || null, byId, byName, paidOn, checkedBy: null, reply: null, txn: txn || null, forWhat, payId: null, photoId: more.photoId || null, billId: more.billId || null, periodFrom: more.periodFrom || null, periodTo: more.periodTo || more.periodFrom || null, requestId: more.requestId || null };
  S.proofs.push(pr);
  const pay = entryPayment(o, pr, d, t);
  log(d, t, 'payment', `${rs(amount)} ${method === 'Cash' ? 'cash' : 'bank transfer'} for ${o.apt} entered by ${byName}${ref ? ` (receipt ${ref})` : ''}${txn ? ` (transaction ${txn})` : ''}${more.periodFrom ? ` for ${periodText(more.periodFrom, more.periodTo)}` : ''}, paid ${fd(paidOn)}${more.requestId ? ` (payment request ${more.requestId}). Receipt ${pay.receipt} goes to the customer once the Accountant approves the money` : `. Receipt ${pay.receipt} ready to send; the Accountant confirms the money`}`, o.id);
  return pr;
}
export function rejectProof(p: Proof, d: string, t: string, by = '', reason = '') {
  const o = ownerById(p.ownerId);
  p.status = 'rejected'; p.doneOn = d; p.checkedBy = by || null; p.reply = reason || null;
  if (p.kind === 'cash') {
    const pay = p.payId ? S.payments.find(x => x.id === p.payId && !x.reversed) : undefined;
    if (!pay) {   // an entry made before 19 Nov 2026: it never counted
      log(d, t, 'payment', `${p.method || 'Cash'} of ${rs(p.amount)} for ${o.apt} entered by ${p.byName || 'a building manager'} was not confirmed by ${by || 'the accountant'}${reason ? `: ${reason}` : ''}. The balance is unchanged`, o.id);
      return;
    }
    // The payment counted from the entry and its receipt may already be with the customer: take it back, and the
    // building manager puts it right with the customer (and enters it again if it was paid).
    const sent = S.messages.some(m => m.kind === 'receipt' && m.pdf?.id === pay.id && m.status !== 'pending' && m.status !== 'skipped');
    reversePayment(o, pay, `Not received by ${by || 'the Accountant'}${reason ? `: ${reason}` : ''}`, by || 'Accountant', d, t, true);
    // A payment request answered with this entry opens again, so the building manager sees it and puts it right.
    const rq = p.requestId ? (S.requests || []).find(x => x.id === p.requestId) : null;
    if (rq && rq.status === 'entered') Object.assign(rq, { status: 'open', proofId: null, doneD: null, doneT: null, reply: `Not received by ${by || 'the Accountant'}${reason ? `: ${reason}` : ''}` });
    S.alerts.push({ id: 'AL' + nid('al'), ownerId: o.id, project: S.project, d, done: false, kind: 'entry',
      text: `${p.method || 'Cash'} of ${rs(p.amount)} (receipt ${pay.receipt}) entered by ${p.byName || 'the building manager'} on ${fd(p.d)} was not received by ${by || 'the Accountant'}${reason ? `: ${reason}` : ''}. The payment was taken back${sent ? ' after its receipt went to the customer' : ' and its receipt not sent'}. Put it right with ${first(o.name)} and enter the payment again if it was paid.` });
    log(d, t, 'payment', `${p.method || 'Cash'} of ${rs(p.amount)} for ${o.apt} (receipt ${pay.receipt}) not received by ${by || 'the accountant'}${reason ? `: ${reason}` : ''}. Payment taken back; the building manager follows it up`, o.id);
    return;
  }
  pushMsg(o, d, t, { kind: 'info', title: 'About your transfer', manual: true, text: `We couldn't find your transfer of ${rs(p.amount)} in our bank account. Please check the reference and send the bank receipt again, or contact your building manager.` });
  log(d, t, 'message', `Screenshot from ${o.apt} not matched in the bank statement; owner told on WhatsApp`, o.id);
}
// Staff send an owner their dues any time (the "Send on WhatsApp" button). Kind 'link' is the dues message.
export function sendDues(o: Owner, d: string, t: string) {
  const bal = balance(o);
  if (bal <= 0) return null;
  const bd = duesBreakdown(o);
  const vars = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal) };
  const m = pushMsg(o, d, t, { kind: 'link', title: 'Your dues', text: fill(S.templates.link.text, vars), tpl: 'link', vars, pdf: { kind: 'statement', id: o.id }, manual: true });
  log(d, t, 'message', `Dues of ${rs(bal)} ready to send to ${o.apt} by ${S.by}`, o.id);
  return m;
}

/* ---------- cash: reversals, cancellations, hand-overs and bank deposits ----------
 * Payments are cash only. A building manager takes the cash and enters it; once the Accountant confirms it, the payment
 * counts and the cash is "in hand" with that manager until he hands it over. The Accountant receives the hand-over and
 * later deposits it in the bank (deposit slip). Cash paid at the office is with the Accountant from the start. */

/** Cash paid at the office, recorded by the Accountant: it counts at once and is already with the Accountant. */
export function officeCash(o: Owner, amt: number, ref: string, d: string, t: string, staffId: string | null, name: string) {
  const p = recordPayment(o, amt, 'Cash (paid at the office)', ref, d, 'staff', t, name, { collectorId: staffId, collectorName: name, enteredBy: name, approvedBy: name, approvedAt: `${d} ${t}` });
  const h: Handover = { id: 'HO-' + (100 + nid('ho')), project: S.project, fromId: staffId, fromName: `${name} (office)`, amount: amt, paymentIds: [p.id], d, t,
    status: 'received', receivedBy: name, receivedD: d, note: 'Cash paid at the office', reply: null, depositSlip: null, depositD: null, depositedBy: null };
  S.handovers.push(h); p.handoverId = h.id;
  return p;
}
/** Take back a wrong payment exactly as it was shared out (bills, old arrears, fine, credit). The payment stays in the
 *  database marked as reversed; the ledger gets a matching entry, so the balance is back to what it was. */
export function reversePayment(o: Owner, p: Payment, reason: string, by: string, d: string, t: string, fromEntry = false) {
  if (p.reversed) throw new Error('This payment was already reversed.');
  const label = (b: Bill) => `${b.months ? 'Maintenance' : 'Utilities'}, ${periodLabel(b)}`;
  for (const a of p.applied || []) {
    const ref = a.ref || (a.kind === 'fee' ? 'fee' : a.kind === 'credit' ? 'credit' : a.label.startsWith('Earlier dues') ? 'arrears' : billsOf(o).find(b => label(b) === a.label)?.id || 'arrears');
    if (ref === 'fee') o.feeDue = (o.feeDue || 0) + a.amount;
    else if (ref === 'arrears') o.openingLeft = (o.openingLeft || 0) + a.amount;
    else if (ref === 'credit') {
      let x = a.amount; const fromCredit = Math.min(o.credit || 0, x); o.credit -= fromCredit; x -= fromCredit;
      // Credit already used on later bills: those bills are unpaid again by that much.
      for (const b of [...billsOf(o)].reverse()) { if (x <= 0) break; const y = Math.min(x, b.fromCredit || 0); if (y > 0) { b.fromCredit -= y; b.paid -= y; x -= y; } }
    } else { const b = S.bills.find(x => x.id === ref); if (b) b.paid = Math.max(0, b.paid - a.amount); else o.openingLeft = (o.openingLeft || 0) + a.amount; }
  }
  addEntry(o.id, d, 'reversal', p.amount, `Payment reversed · ${p.receipt} · ${reason}`, { ref: p.receipt, pid: p.id });
  p.reversed = { d, t, by, reason };
  // Out of any hand-over not yet deposited; its receipt message, if still waiting, is not sent.
  const h = p.handoverId ? S.handovers.find(x => x.id === p.handoverId) : null;
  if (h && !h.depositSlip) { h.paymentIds = h.paymentIds.filter(x => x !== p.id); h.amount -= p.amount; }
  for (const m of S.messages) if (m.status === 'pending' && m.pdf?.kind === 'receipt' && m.pdf.id === p.id) { m.status = 'skipped'; m.error = `Payment reversed on ${fd(d)}`; }
  // A payment from a building manager's entry the Accountant hasn't approved yet: the entry is closed too.
  if (!fromEntry && p.entryId) { const pr = S.proofs.find(x => x.id === p.entryId && x.status === 'pending'); if (pr) { pr.status = 'cancelled'; pr.doneOn = d; pr.reply = `Payment reversed by ${by}: ${reason}`; } }
  log(d, t, 'payment', `Payment ${p.receipt} of ${rs(p.amount)} for ${o.apt} reversed by ${by}: ${reason}. ${o.apt} owes ${rs(balance(o))} again${h && h.depositSlip ? `. It was already deposited (slip ${h.depositSlip}): correct the bank record` : ''}`, o.id);
  return p;
}
/** A building manager takes back a cash entry he made by mistake, before the Accountant confirms it. */
export function cancelCash(pr: Proof, by: string, reason: string, d: string, t: string) {
  if (pr.status !== 'pending') throw new Error('Only an entry still waiting for the Accountant can be cancelled.');
  pr.status = 'cancelled'; pr.doneOn = d; pr.reply = `Cancelled by ${by}${reason ? `: ${reason}` : ''}`;
  const o = ownerById(pr.ownerId), pay = pr.payId ? S.payments.find(x => x.id === pr.payId && !x.reversed) : undefined;
  if (pay) reversePayment(o, pay, `Entry cancelled by ${by}${reason ? `: ${reason}` : ''}`, by, d, t, true);
  log(d, t, 'payment', `${pr.method === 'Bank transfer' ? 'Bank transfer' : 'Cash'} entry of ${rs(pr.amount)} for ${o?.apt} (receipt ${pr.ref || '—'}) cancelled by ${by}${reason ? `: ${reason}` : ''}${pay ? `. Payment ${pay.receipt} taken back` : ''}`, pr.ownerId);
}
/** Confirmed cash still with this person (not handed over yet). */
export const cashInHand = (collectorId: string) => S.payments.filter(p => p.collectorId === collectorId && !p.handoverId && !p.reversed && !awaitingApproval(p));
/** A building manager hands all his confirmed cash in this building over to the Accountant. */
export function handOver(collectorId: string, name: string, note: string, d: string, t: string) {
  const list = cashInHand(collectorId);
  if (!list.length) throw new Error('There is no confirmed cash to hand over.');
  const h: Handover = { id: 'HO-' + (100 + nid('ho')), project: S.project, fromId: collectorId, fromName: name, amount: list.reduce((a, p) => a + p.amount, 0), paymentIds: list.map(p => p.id), d, t,
    status: 'pending', receivedBy: null, receivedD: null, note: note || null, reply: null, depositSlip: null, depositD: null, depositedBy: null };
  S.handovers.push(h); list.forEach(p => { p.handoverId = h.id; });
  log(d, t, 'payment', `${name} handed over ${rs(h.amount)} cash (${list.length} payment${list.length === 1 ? '' : 's'}, ${h.id}) to the Accountant${note ? `: ${note}` : ''}`);
  return h;
}
/** The Accountant counts a hand-over: received in full, or a problem (short, missing), sent back with a note. */
export function receiveHandover(h: Handover, ok: boolean, by: string, reply: string, d: string, t: string) {
  if (h.status !== 'pending') throw new Error('This hand-over was already dealt with.');
  if (ok) { h.status = 'received'; h.receivedBy = by; h.receivedD = d; h.reply = reply || null; }
  else {
    h.status = 'disputed'; h.receivedBy = by; h.receivedD = d; h.reply = reply || 'Not as entered';
    // The cash goes back to "in hand" so the building manager can hand it over again once it is sorted out.
    for (const p of S.payments) if (p.handoverId === h.id) p.handoverId = null;
  }
  log(d, t, 'payment', ok ? `${by} received ${rs(h.amount)} cash from ${h.fromName} (${h.id})` : `${by} did not accept ${h.id} from ${h.fromName} (${rs(h.amount)}): ${h.reply}`);
}
/** Received cash put in the bank: the deposit slip number and date go on each hand-over. */
export function depositHandovers(ids: string[], slip: string, depositD: string, by: string, d: string, t: string) {
  const list = S.handovers.filter(h => ids.includes(h.id) && h.status === 'received' && !h.depositSlip);
  for (const h of list) { h.depositSlip = slip; h.depositD = depositD; h.depositedBy = by; }
  if (list.length) log(d, t, 'payment', `${rs(list.reduce((a, h) => a + h.amount, 0))} cash deposited in the bank by ${by}, slip ${slip} (${fd(depositD)}): ${list.map(h => h.id).join(', ')}`);
  return list;
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
    const sl = nextSlotFor(o, d);
    if (sl && sl.billOn === d) ev.push({ kind: 'bill', text: `Bill for ${o.apt} (${coverLabel(sl.from, sl.to)}, due ${fds(sl.due)})`, o });
    for (const b of billsOf(o)) if (!b.fined && b.months > 0 && b.finalDate === d && unpaidMaint(b) > 0)
      ev.push({ kind: 'fine', text: promiseOn(o, d) ? `Late warning for ${o.apt} (paused by a promise)` : `Late warning for ${o.apt}, if still unpaid`, o });
    const oe = openingEvent(o, d);
    if (oe === 'statement') ev.push({ kind: 'bill', text: `Go-live statement for ${o.apt}`, o });
    else if (oe === 'notice') ev.push({ kind: 'fine', text: promiseOn(o, d) ? `Late warning for ${o.apt} (earlier dues, paused)` : `Late warning for ${o.apt} (earlier dues)`, o });
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
/** Owners with WhatsApp messages waiting to be sent by hand (bills, reminders, notices, receipts…). */
export const toSendOwners = () => new Set(S.messages.filter(m => m.status === 'pending' && m.from === 'biz').map(m => m.ownerId)).size;
/** Everything in To do: messages to send by hand, bank transfers to check, numbers to fix, promises not kept. */
export const followCount = () => toSendOwners() + S.proofs.filter(p => p.status === 'pending').length + failedList().length + S.alerts.filter(a => !a.done).length;
export const sortedPayments = () => [...S.payments].sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t));
export function duesBreakdown(o: Owner): Breakdown {
  const rows: Breakdown['rows'] = [];
  if (o.openingLeft > 0) { const ip = instalmentStatus(o);
    rows.push({ label: `Earlier dues (before ${fm(goLive().slice(0, 7))})${ip ? ', on an instalment plan' : ''}`, short: 'Earlier dues', amount: o.openingLeft,
      sub: ip ? (ip.overdue ? `${rs(ip.overdue)} of instalments late` : ip.next ? `next instalment ${rs(ip.next.left)} by ${fds(ip.next.due)}` : undefined) : undefined }); }
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
  // Before the first bill: when billing starts (the bill day of the go-live month, for that month).
  const fb = firstBillDate(), firstBill = S.today <= fb && (S.settings.lastRun || '') < fb ? fb : null;
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
