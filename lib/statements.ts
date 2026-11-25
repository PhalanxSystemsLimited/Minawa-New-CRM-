// Closing statements (26 Nov 2026), for the accountant (and the Admin): what each customer owed at the start of a
// period, everything charged and paid in it, and what they owe at its end; worked out from the account entries, so
// they always agree with the balances on every screen. Call inside the engine (use).
//  · accountOf / accountDoc: one customer's statement of account (PDF): opening balance, every bill, fine, discount,
//    adjustment and payment line by line with the running balance, the payments in the period (receipt, the months
//    each one paid for, cash book number or bank reference, who entered and approved it), and the closing balance
//    (with what is left of each year when the period runs to today).
//  · closingRows / closingDoc: a building's closing statement (PDF and Excel): every customer's opening, charges,
//    fines, discounts and credits, payments and closing balance, with totals.
import type { Owner, Payment, Entry } from './types';
import { PLAN_LABEL } from './types';
import { cur } from './engine';
import { custId } from './people';
import { yearDues } from './requests';
import { orgLine, type DocData } from './docdata';
import { fd, rs, periodText } from './fmt';

const idN = (e: Entry) => +(e.id.match(/(\d+)$/)?.[1] || 0);
const byDate = (a: Entry, b: Entry) => a.d.localeCompare(b.d) || idN(a) - idN(b);
const KIND: Record<string, string> = { opening: 'Earlier dues (office list)', bill: 'Bill', utility: 'Electricity / utility bill', fine: 'Fine', discount: 'Discount', adjustment: 'Adjustment', reversal: 'Payment taken back', payment: 'Payment' };

export interface AccLine { e: Entry; pay: Payment | null; charge: number; credit: number; bal: number; text: string; ref: string }
export interface Account {
  o: Owner; from: string; to: string; opening: number; closing: number; lines: AccLine[];
  charges: number; fines: number; credits: number; paid: number; pays: Payment[];
}

/** One customer's account between two dates (both included). */
export function accountOf(o: Owner, from: string, to: string): Account {
  const S = cur(), ents = S.entries.filter(e => e.ownerId === o.id).sort(byDate);
  const pays = new Map(S.payments.map(p => [p.id, p]));
  let bal = ents.filter(e => e.d < from).reduce((a, e) => a + e.amount, 0);
  const opening = bal, lines: AccLine[] = [];
  let charges = 0, fines = 0, credits = 0, paid = 0;
  for (const e of ents) {
    if (e.d < from || e.d > to) continue;
    bal += e.amount;
    const pay = e.kind === 'payment' && e.pid ? pays.get(e.pid) || null : null;
    if (e.kind === 'payment') paid += -e.amount; else if (e.kind === 'fine') fines += e.amount; else if (e.amount > 0) charges += e.amount; else credits += -e.amount;
    const text = pay ? `Payment · ${/bank/i.test(pay.method) ? 'bank transfer' : 'cash'}${pay.periodFrom ? ` for ${periodText(pay.periodFrom, pay.periodTo)}` : ''}${pay.reversed ? ' (later taken back)' : ''}`
      : `${KIND[e.kind] || e.kind}${e.desc && !e.desc.startsWith('Payment ·') ? ` · ${e.desc}` : ''}`;
    lines.push({ e, pay, charge: e.amount > 0 ? e.amount : 0, credit: e.amount < 0 ? -e.amount : 0, bal, text, ref: pay ? pay.receipt : e.ref || '' });
  }
  const inP = S.payments.filter(p => p.ownerId === o.id && p.d >= from && p.d <= to).sort((a, b) => `${a.d}${a.t}`.localeCompare(`${b.d}${b.t}`));
  return { o, from, to, opening, closing: bal, lines, charges, fines, credits, paid, pays: inP };
}

const money = (n: number) => n < 0 ? `${rs(-n)} cr` : rs(n);
const status = (p: Payment) => p.reversed ? 'Taken back' : p.entryId ? (cur().proofs.find(x => x.id === p.entryId)?.status === 'pending' ? 'Waiting for the accountant' : `Approved${p.approvedBy ? ` by ${p.approvedBy}` : ''}`) : 'Recorded';

/** A customer's statement of account as a document (PDF). */
export function accountDoc(o: Owner, from: string, to: string): DocData {
  const S = cur(), a = accountOf(o, from, to), today = S.today, toNow = to >= today;
  const years = toNow ? yearDues(o) : [];
  const grid = a.lines.map(l => [fd(l.e.d), l.text, l.ref, l.charge ? rs(l.charge) : '', l.credit ? rs(l.credit) : '', money(l.bal)]);
  grid.unshift(['', `Opening balance on ${fd(from)}`, '', '', '', money(a.opening)]);
  grid.push(['Total', `Closing balance on ${fd(to)}`, '', rs(a.charges + a.fines), rs(a.credits + a.paid), money(a.closing)]);
  const payRows = a.pays.map(p => [fd(p.d), p.receipt, rs(p.amount), p.periodFrom ? periodText(p.periodFrom, p.periodTo) : '—', /bank/i.test(p.method) ? 'Bank transfer' : 'Cash',
    p.txn ? `TXN ${p.txn}` : p.entryId ? `Cash book ${p.ref}` : p.ref || '', p.enteredBy || p.by || '', status(p)]);
  return {
    org: orgLine(), kind: 'account', filename: `Statement-${o.apt}-${from}-to-${to}.pdf`, project: S.proj.name, subtitle: `${S.proj.name} · Statement of account`, refNo: custId(o), refSub: `${fd(from)} – ${fd(to)}`,
    kv: [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Customer', `${o.name}${o.status === 'closed' ? ` (left ${o.closedOn ? fd(o.closedOn) : ''})` : ''}`], ['Customer ID', custId(o)],
      ['Billing plan', PLAN_LABEL[o.plan || 'monthly']], ['Period', `${fd(from)} – ${fd(to)}`], ['Statement made', fd(today)]],
    tables: [{ head: ['Summary', 'Amount'], rows: [
      { label: `Opening balance on ${fd(from)}`, amount: money(a.opening) },
      { label: 'Charged', sub: 'maintenance, generator, utilities, adjustments', amount: rs(a.charges) },
      { label: 'Fines', amount: rs(a.fines) },
      { label: 'Discounts and credits', amount: a.credits ? `− ${rs(a.credits)}` : rs(0) },
      { label: 'Paid', amount: a.paid ? `− ${rs(a.paid)}` : rs(0) },
      { label: a.closing < 0 ? `Advance credit on ${fd(to)}` : `Closing balance on ${fd(to)}`, amount: rs(Math.abs(a.closing)), tot: true }] },
      ...(years.length > 1 ? [{ head: ['What is left, by year', 'Amount'] as [string, string], rows: years.map(y => ({ label: y.label, amount: rs(y.amount) })) }] : [])],
    grids: [
      { title: 'Account, line by line', cols: ['Date', 'Details', 'Reference', 'Charged', 'Paid / credit', 'Balance'], rows: grid, widths: [1.1, 4, 1.3, 1.1, 1.2, 1.2], right: [3, 4, 5], total: true },
      { title: 'Payments in this period', cols: ['Date', 'Receipt', 'Amount', 'For', 'Received as', 'Reference', 'Entered by', 'Status'], rows: payRows, widths: [1, 1.2, 1, 1.3, 1, 1.4, 1.3, 1.6], right: [2], empty: 'No payments in this period.' }],
    foot: `What is left unpaid at the end of a year carries into the next year's balance${years.length > 1 ? ', as listed above by year' : ''}. Bills show what was charged at the time; a payment taken back stays on the record.`
  };
}

export interface ClosingRow { o: Owner; id: string; opening: number; charges: number; fines: number; credits: number; paid: number; closing: number; years: string }
/** Every customer of the building with something in or before the period (active, and past customers with a balance or activity). */
export function closingRows(from: string, to: string): ClosingRow[] {
  const S = cur();
  return S.owners.map(o => { const a = accountOf(o, from, to), ys = to >= S.today ? yearDues(o) : [];
    return { o, id: custId(o), opening: a.opening, charges: a.charges, fines: a.fines, credits: a.credits, paid: a.paid, closing: a.closing, years: ys.length > 1 ? ys.map(y => `${y.label}: ${rs(y.amount)}`).join(' · ') : '' }; })
    .filter(r => r.o.status === 'active' || r.opening || r.closing || r.charges || r.paid)
    .sort((a, b) => a.o.apt.localeCompare(b.o.apt, 'en', { numeric: true }));
}

/** A building's closing statement as a document (PDF). */
export function closingDoc(from: string, to: string): DocData {
  const S = cur(), rows = closingRows(from, to), sum = (k: 'opening' | 'charges' | 'fines' | 'credits' | 'paid' | 'closing') => rows.reduce((a, r) => a + r[k], 0);
  const grid = rows.map(r => [r.o.apt, `${r.o.name}${r.o.status === 'closed' ? ' (left)' : ''}`, money(r.opening), rs(r.charges), rs(r.fines), r.credits ? rs(r.credits) : '', rs(r.paid), money(r.closing)]);
  grid.push(['Total', `${rows.length} customers`, money(sum('opening')), rs(sum('charges')), rs(sum('fines')), rs(sum('credits')), rs(sum('paid')), money(sum('closing'))]);
  const owing = rows.filter(r => r.closing > 0);
  return {
    org: orgLine(), kind: 'closing', filename: `Closing-statement-${S.project}-${from}-to-${to}.pdf`, project: S.proj.name, subtitle: `${S.proj.name} · Closing statement`, refNo: S.proj.name, refSub: `${fd(from)} – ${fd(to)}`,
    kv: [['Building', S.proj.name], ['Period', `${fd(from)} – ${fd(to)}`], ['Customers', String(rows.length)], ['Statement made', fd(S.today)]],
    tables: [{ head: ['Summary', 'Amount'], rows: [
      { label: `Owed on ${fd(from)} (opening)`, amount: money(sum('opening')) },
      { label: 'Charged', amount: rs(sum('charges')) }, { label: 'Fines', amount: rs(sum('fines')) },
      { label: 'Discounts and credits', amount: `− ${rs(sum('credits'))}` }, { label: 'Paid', amount: `− ${rs(sum('paid'))}` },
      { label: `Owed on ${fd(to)} (closing)`, sub: `${owing.length} customer${owing.length === 1 ? '' : 's'} owing`, amount: money(sum('closing')), tot: true }] }],
    grids: [{ title: 'Customers', cols: ['Flat', 'Customer', 'Opening', 'Charged', 'Fines', 'Credits', 'Paid', 'Closing'], rows: grid, widths: [0.9, 2.6, 1.1, 1.1, 0.9, 0.9, 1.1, 1.1], right: [2, 3, 4, 5, 6, 7], total: true }],
    foot: 'Opening and closing are each customer\'s balance at the start and the end of the period ("cr" is advance credit). Charged includes maintenance, generator, utilities and adjustments.'
  };
}
