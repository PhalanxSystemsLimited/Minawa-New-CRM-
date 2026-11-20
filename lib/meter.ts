// Sub-meter electricity (21 Nov 2026, Country Club). Each flat has its own meter. On the reading day the building
// manager enters each flat's reading; the bill is the units used since the last reading x the unit rate the Minawa
// Admin set (a dated rate card row, so old bills keep their rate). The first reading counts from the reading taken
// at possession. Bills are electricity bills like Oakwood's: their own due date (N days after the bill, set by the
// Admin), reminders on the Admin's days, the customer's balance includes them. A late fine is the building manager's
// call, at the Admin's % for how late the bill is, and waits for the Admin's approval. Engine scope (cur()).
import { cur, rateFor, createBill, sendBill, addEntry, log, at, nid, ownerById, isUtilBill, periodLabel } from './engine';
import { addDays, diff, fd, fm, rs } from './fmt';
import type { Bill, Charge, Owner, Rules } from './types';

export const ELEC_RATE = 'Electricity per unit';
const KIND = 'Electricity';

/* ---------- the Admin's settings ---------- */
const R = (): Rules => cur().settings.rules;
/** Electricity is billed in this building at all. */
export const elecOn = () => R().utilities.includes(KIND);
/** Sub-meters: units used x the unit rate. */
export const meterMode = () => elecOn() && R().elecMode === 'meter';
export const unitRate = (d: string) => rateFor(ELEC_RATE, d);
export const readDay = () => Math.max(1, Math.min(28, Math.round(+(R().elecReadDay ?? 1)) || 1));
export const elecDueDays = () => Math.max(1, Math.min(60, Math.round(+(R().elecDueDays ?? 15)) || 15));
/** Reminder days, relative to the due date (negative = before it). Oakwood's first rule: 3 days after. */
export const remindDays = () => { const l = Array.isArray(R().elecRemind) ? R().elecRemind!.map(Number).filter(n => Number.isFinite(n) && n >= -30 && n <= 90) : [3]; return [...new Set(l.length ? l : [3])].sort((a, b) => a - b); };
/** The fine steps: from `days` late, `pct`% of what is unpaid on the bill. */
export const fineSteps = () => (Array.isArray(R().elecFine) ? R().elecFine! : []).filter(x => x && x.days >= 0 && x.pct > 0).sort((a, b) => a.days - b.days);
export const finePctFor = (daysLate: number) => { let p = 0; for (const x of fineSteps()) if (daysLate >= x.days) p = x.pct; return p; };
export const remindLabel = (n: number) => n === 0 ? 'on the due date' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} before` : `${n} day${n === 1 ? '' : 's'} after`;

/* ---------- readings ---------- */
const elecCharges = (o: Owner) => cur().charges.filter(c => c.ownerId === o.id && c.kind === KIND && c.curReading != null).sort((a, b) => a.period.localeCompare(b.period) || a.d.localeCompare(b.d));
/** The reading the next bill counts from: the last bill's reading, or the reading at possession. */
export function lastReading(o: Owner, before?: string): { value: number; from: string } | null {
  const l = elecCharges(o).filter(c => !before || c.period < before);
  const c = l[l.length - 1];
  if (c && c.curReading != null) return { value: c.curReading, from: `${fm(c.period)} bill` };
  if (o.meterIn) return { value: o.meterIn.reading, from: `possession, ${fd(o.meterIn.d)}` };
  return null;
}
export const meterLabel = (c: Pick<Charge, 'period' | 'prevReading' | 'curReading' | 'units'>, rate: number) =>
  `${KIND}, ${fm(c.period)} (meter ${c.prevReading ?? '—'} → ${c.curReading ?? '—'}, ${c.units ?? 0} unit${c.units === 1 ? '' : 's'} × ${rs(rate)})`;

/** Bills one flat for the month from its reading. `prev` only when there's no earlier reading on file. */
export function billReading(o: Owner, period: string, cur0: number, prevIn: number | null, by: string, photo: string | null = null): Bill {
  const s = cur(), d = s.today;
  if (!meterMode()) throw new Error('Sub-meter billing isn\'t switched on for this building');
  if (o.status !== 'active') throw new Error(`${o.apt}: not an active customer`);
  if (s.charges.some(c => c.ownerId === o.id && c.period === period && c.kind === KIND && c.billId)) throw new Error(`${o.apt} already has its ${fm(period)} electricity bill. Correct it with Edit while unpaid.`);
  const last = lastReading(o, period), prev = last ? last.value : prevIn;
  if (prev == null) throw new Error(`${o.apt}: enter the previous reading (there is none on file)`);
  if (cur0 < prev) throw new Error(`${o.apt}: the reading ${cur0} is lower than the last one (${prev})`);
  const rate = unitRate(d);
  if (!rate) throw new Error('The Admin hasn\'t set the unit rate yet (Settings › Electricity)');
  const units = cur0 - prev, amount = Math.round(units * rate);
  if (!amount) throw new Error(`${o.apt}: no units used since the last reading (${prev}); nothing to bill`);
  const ex = s.charges.find(c => c.ownerId === o.id && c.period === period && c.kind === KIND && !c.billId);
  const c: Charge = ex || { id: 'CH' + nid('ch'), ownerId: o.id, project: s.project, period, kind: KIND, amount: 0, units: 0, note: '', by, d, billId: null, prevReading: null, curReading: null };
  Object.assign(c, { amount, units, prevReading: prev, curReading: cur0, by, d });
  if (!ex) s.charges.push(c);
  const b = createBill(o, d, { utilitiesOnly: true, due: addDays(d, elecDueDays()) });
  const line = b.lines.find(l => l.kind === 'utility' && l.label.startsWith(`${KIND}, ${fm(period)}`));
  if (line) line.label = meterLabel(c, rate);
  if (photo) b.photoId = photo;
  if (b.net) sendBill(o, b, d);
  log(d, at(15), 'bill', `${KIND} for ${o.apt}, ${fm(period)}: meter ${prev} → ${cur0}, ${units} units × ${rs(rate)} = ${rs(amount)}, entered by ${by}; bill ${b.id} due ${fd(b.dueDate)}`, o.id);
  return b;
}

/** Corrects a sub-meter bill's reading (while nothing is paid on it): units and amount follow, at the bill's rate. */
export function correctReading(b: Bill, cur0: number, prevIn: number | null, due: string, by: string) {
  const s = cur(), o = ownerById(b.ownerId), c = s.charges.find(x => x.billId === b.id && x.kind === KIND);
  if (!c) throw new Error('This bill has no meter reading to correct');
  const prev = prevIn ?? c.prevReading;
  if (prev == null) throw new Error('Enter the previous reading');
  if (cur0 < prev) throw new Error(`The reading ${cur0} is lower than the previous one (${prev})`);
  const rate = unitRate(b.billDate) || unitRate(s.today), units = cur0 - prev, amount = Math.round(units * rate), was = { prev: c.prevReading, cur: c.curReading, amount: c.amount };
  if (!rate) throw new Error('The Admin hasn\'t set the unit rate yet (Settings › Electricity)');
  if (!amount) throw new Error('No units used: nothing to bill');
  const line = b.lines.find(l => l.kind === 'utility' && l.label.startsWith(`${KIND}, ${fm(c.period)}`)), dlt = amount - c.amount;
  Object.assign(c, { amount, units, prevReading: prev, curReading: cur0, by, d: s.today });
  if (line) { line.amount = amount; line.label = meterLabel(c, rate); }
  b.extras += dlt; b.net += dlt; b.dueDate = due; b.finalDate = addDays(due, R().warnAfter ?? 15);
  const e = s.entries.find(x => x.ref === b.id && x.kind === 'utility' && x.ownerId === o.id); if (e) e.amount = amount;
  return `meter ${was.prev ?? '—'} → ${was.cur ?? '—'} (${rs(was.amount)}) changed to ${prev} → ${cur0}, ${units} units × ${rs(rate)} = ${rs(amount)}`;
}

/* ---------- reminders ---------- */
/** Which of the Admin's reminder days have come for this bill (1-based count). */
export const remindersDue = (b: Bill, d: string) => remindDays().filter(n => addDays(b.dueDate, n) <= d).length;
/** Automatic reminders already queued for this bill (manual ones are kept as 0). */
export const autoReminders = (b: Bill) => (b.reminders || []).filter(x => x > 0).length;

/* ---------- the late fine ---------- */
export const FINE_LABEL = 'Late fine';
export const hasFine = (b: Bill) => b.lines.some(l => l.label.startsWith(FINE_LABEL));
export function fineOfferFor(b: Bill, d: string) {
  const late = diff(d, b.dueDate), left = Math.max(0, b.net - b.paid), pct = late > 0 ? finePctFor(late) : 0;
  return { late, left, pct, amount: Math.round(left * pct / 100) };
}
/** Adds the approved fine to the electricity bill (a line of its own; paid with the bill). */
export function addElecFine(b: Bill, pct: number, amount: number, days: number, who: string) {
  const s = cur(), o = ownerById(b.ownerId);
  if (!isUtilBill(b)) throw new Error('Not an electricity bill');
  if (hasFine(b)) throw new Error('This bill already has a late fine');
  if (b.net - b.paid <= 0) throw new Error('This bill is paid now; no fine');
  b.lines.push({ kind: 'utility', label: `${FINE_LABEL}: ${pct}% (${days} day${days === 1 ? '' : 's'} late)`, amount });
  b.extras += amount; b.net += amount;
  addEntry(o.id, s.today, 'fine', amount, `Late fine on electricity, ${fm(b.period)} (${pct}%)`, { ref: b.id });
  log(s.today, at(15), 'flag', `Late fine on ${o.apt}'s ${fm(b.period)} electricity bill: ${pct}% = ${rs(amount)} (${days} days late), approved by ${who}`, o.id);
}

/* ---------- leaving / transfer: the final reading ---------- */
/** What the units since the last bill come to at a reading (0 when not sub-meter billing). */
export function finalElec(o: Owner, reading: number | null, d: string) {
  if (!meterMode() || reading == null) return { units: 0, amount: 0, prev: null as number | null, rate: 0 };
  const last = lastReading(o), prev = last?.value ?? null;
  if (prev == null || reading <= prev) return { units: 0, amount: 0, prev, rate: unitRate(d) };
  const rate = unitRate(d), units = reading - prev;
  return { units, amount: Math.round(units * rate), prev, rate };
}
/** Bills the final reading (leaving or transfer); paid from advance credit when there is some. */
export function billFinal(o: Owner, reading: number, d: string, by: string) {
  const f = finalElec(o, reading, d);
  if (!f.amount) return null;
  const s = cur(), period = d.slice(0, 7);
  const c: Charge = { id: 'CH' + nid('ch'), ownerId: o.id, project: s.project, period, kind: KIND, amount: f.amount, units: f.units, note: 'final reading', by, d, billId: null, prevReading: f.prev, curReading: reading };
  s.charges.push(c);
  const b = createBill(o, d, { utilitiesOnly: true, due: d });
  const line = b.lines.find(l => l.kind === 'utility' && l.label.startsWith(`${KIND}, ${fm(period)}`));
  if (line) line.label = `${meterLabel(c, f.rate)} · final reading`;
  log(d, at(15), 'bill', `Final electricity for ${o.apt}: meter ${f.prev} → ${reading}, ${f.units} units × ${rs(f.rate)} = ${rs(f.amount)} (bill ${b.id})`, o.id);
  return b;
}
