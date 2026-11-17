// The content of each document (bill, receipt, statement, clearance), worked out once and drawn twice:
// on screen (components/Docs.tsx, the demo's .doc look) and as the PDF sent on WhatsApp (lib/pdf.tsx).
// Call inside use(state, …).
import type { Bill, Payment, Owner, Clearance } from './types';
import { t12 } from '@/lib/fmt';
import { cur, ownerById, duesBreakdown, balance, feePct, periodLabel, billsOf, unpaidMaint, openingDue, fineBase } from './engine';
import { fd, fm, fmShort, rs } from './fmt';

export interface DocRow { label: string; sub?: string; amount: string; bold?: boolean; tot?: boolean }
export interface DocData {
  kind: 'bill' | 'receipt' | 'statement' | 'clearance';
  filename: string; project: string; subtitle: string; refNo: string; refSub: string;
  stamp?: { sp: boolean; title: string; text: string; amount: string } | null;
  certificate?: string | null;
  kv: [string, string][];
  tables: { head?: [string, string]; rows: DocRow[] }[];
  howToPay?: string[] | null; fine?: string | null; foot?: string | null; paras?: string[]; org?: string;
  /** Bill vouchers: the amount payable by the due date, and after it (with the fine), in a strip at the top. */
  voucher?: { no: string; due: string; within: string; after: string | null; afterNote: string } | null;
  /** Bill vouchers: the office copy at the foot, cut off and kept by the building manager when they take the money. */
  counterfoil?: [string, string][] | null;
}
/** What a customer pays by the due date, and after it: the fine is added on what is unpaid then. */
function voucherOf(o: Owner, no: string, due: string, total: number): NonNullable<DocData['voucher']> {
  const fineNow = o.feeDue || 0, fineThen = Math.round(fineBase(o) * feePct() / 100), extra = Math.max(0, fineThen - fineNow);
  return { no, due: fd(due), within: rs(Math.max(0, total)), after: extra > 0 ? rs(total + extra) : null,
    afterNote: extra > 0 ? `includes the ${feePct()}% fine` : `a ${feePct()}% fine is added on unpaid bills after the due date` };
}
const counterfoilOf = (o: Owner, no: string, due: string, total: number): [string, string][] =>
  [['Voucher', no], ['Apartment', `${o.apt} · ${o.name}`], ['Due date', fd(due)], ['Amount', rs(Math.max(0, total))], ['Received (Rs)', ''], ['Building manager\'s signature', '']];
/** Company line printed at the foot of every document. */
export function orgLine() { const c = cur().company; if (!c) return ''; return [c.legalName, c.address, c.ntn ? `NTN ${c.ntn}` : '', c.phone, c.email].filter(Boolean).join(' · '); }
const S = () => cur();
/** How an owner pays: in cash to the building manager, against a receipt (payments are in cash only). */
const howToPay = (ref: string) => [`Pay in cash to your building manager and show this voucher (${ref}). They keep the office copy and give you a receipt.`,
  'Only cash is accepted: no bank transfers or cheques. Your payment receipt is sent to you on WhatsApp once it is confirmed.'];

export function billDoc(b: Bill): DocData {
  const o = ownerById(b.ownerId), proj = S().proj;
  const tables: DocData['tables'] = [];
  // What this bill charges: maintenance for the plan's months, discounts, and the utility bills entered.
  const lines: DocRow[] = (b.lines || []).map(x => ({ label: x.label, amount: x.amount < 0 ? '−' + rs(-x.amount) : rs(x.amount) }));
  if (b.fromCredit) lines.push({ label: 'Paid from advance credit', amount: '−' + rs(b.fromCredit) });
  lines.push({ label: `This bill, ${periodLabel(b)}`, amount: rs(b.net - b.fromCredit), bold: true });
  tables.push({ head: ['This bill', 'Amount'], rows: lines });
  // Everything owed when the bill went out: earlier unpaid bills and the fine.
  if (b.bd) {
    const rows: DocRow[] = b.bd.rows.map(r => ({ label: r.label, sub: r.sub, amount: rs(r.amount) }));
    rows.push({ label: 'Dues', amount: rs(b.bd.dues), bold: true });
    if (b.bd.fee) rows.push({ label: `Fine ${feePct()}%`, sub: `of ${rs(b.bd.dues)} dues`, amount: rs(b.bd.fee) });
    rows.push({ label: 'Total payable', amount: rs(b.bd.total), tot: true });
    tables.push({ head: ['Statement of dues', 'Amount'], rows });
  } else {
    tables[0].rows[tables[0].rows.length - 1] = { label: 'Total payable', amount: rs(Math.max(0, b.prev + b.net - b.fromCredit)), tot: true };
    if (b.prev) tables[0].rows.splice(tables[0].rows.length - 1, 0, { label: 'Earlier unpaid dues', amount: rs(b.prev) });
  }
  const total = b.bd ? b.bd.total : Math.max(0, b.prev + b.net - b.fromCredit), vno = `V-${b.id}`;
  return {
    org: orgLine(), kind: 'bill', filename: `Bill-voucher-${b.period}${b.months > 1 ? '-' + b.periodEnd : ''}-${o.apt}.pdf`, project: proj.name, subtitle: `${proj.name} · Maintenance bill voucher`, refNo: vno, refSub: periodLabel(b),
    voucher: voucherOf(o, vno, b.dueDate, total), counterfoil: counterfoilOf(o, vno, b.dueDate, total),
    kv: [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Owner', o.name], ['Billing date', fd(b.billDate)], ['Due date', fd(b.dueDate)]],
    tables,
    howToPay: howToPay(vno),
    fine: `If anything is still unpaid after ${fd(b.dueDate)}, a fine of ${feePct()}% of ${S().settings.rules.fineArrears ? 'all dues' : 'the unpaid bills'} is added. If dues remain unpaid by ${fd(b.finalDate)}, utilities may be disconnected.`
  };
}

export function receiptDoc(p: Payment): DocData {
  const o = ownerById(p.ownerId), proj = S().proj;
  const stamp = { sp: false, title: `Received · ${p.method.replace(' (screenshot checked)', '')}`, text: p.source === 'proof' ? `Paid in cash · ${p.by}` : `Paid in cash · recorded by ${p.by}`, amount: rs(p.amount) };
  const kv: [string, string][] = [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Received from', `${o.name}, owner`], ['Paid on', `${fd(p.d)}, ${t12(p.t)}`],
    ['Payment method', p.method], ['Reference', p.ref], ['Payment ID', p.id]];
  const rank = { dues: 0, fee: 1, credit: 2 }, rows = (p.applied || []).slice().sort((a, b) => rank[a.kind] - rank[b.kind]);
  const bal = p.balAfter < 0 ? `${rs(-p.balAfter)} advance credit` : p.balAfter > 0 ? rs(p.balAfter) : 'Rs 0 · all paid';
  return {
    org: orgLine(), kind: 'receipt', filename: `Receipt-${p.receipt}.pdf`, project: proj.name, subtitle: `${proj.name} · Payment receipt`, refNo: p.receipt, refSub: `${fd(p.d)}, ${p.t}`, stamp, kv,
    tables: [
      { head: ['This payment paid', 'Amount'], rows: [...(rows.length ? rows.map(r => ({ label: r.label, amount: rs(r.amount) })) : [{ label: 'Maintenance dues, oldest first', amount: rs(p.amount) }]), { label: 'Amount received', amount: rs(p.amount), tot: true }] },
      { rows: [...(p.before != null ? [{ label: 'Owed before this payment', amount: p.before < 0 ? `${rs(-p.before)} credit` : rs(p.before) }] : []), { label: 'Balance now', amount: bal, bold: true }] }
    ],
    foot: `${p.source === 'proof' ? `Cash received by the building manager and confirmed by the Accountant (${p.by}).` : `Cash recorded in the CRM by ${p.by}.`} Dues are paid oldest first; the ${feePct()}% late fee is paid in proportion.`
  };
}

export function statementDoc(o: Owner): DocData {
  const bd = duesBreakdown(o), bal = balance(o), proj = S().proj, today = S().today;
  const rows: DocRow[] = bd.rows.map(r => ({ label: r.label, sub: r.sub, amount: rs(r.amount) }));
  rows.push({ label: 'Dues', amount: rs(bd.dues), bold: true });
  if (bd.fee) rows.push({ label: `Fine ${feePct()}%`, sub: `of ${rs(bd.dues)} dues`, amount: rs(bd.fee) });
  rows.push({ label: 'Total to pay', amount: rs(bal), tot: true });
  // The due date on the voucher: the latest unpaid bill's, or the old arrears' (15 Dec at go-live); overdue: today.
  const open = billsOf(o).filter(b => unpaidMaint(b) > 0), lastDue = open.length ? open[open.length - 1].dueDate : null;
  const due = lastDue && lastDue >= today ? lastDue : !lastDue && (o.openingLeft || 0) > 0 && openingDue() >= today ? openingDue() : today;
  const vno = `V-${o.apt.replace(/\s+/g, '')}-${today.replace(/-/g, '')}`;
  return {
    org: orgLine(), kind: 'statement', filename: `Bill-voucher-${o.apt}-${today}.pdf`, project: proj.name, subtitle: `${proj.name} · Maintenance bill voucher`, refNo: vno, refSub: `Issued ${fd(today)}`,
    voucher: bal > 0 ? voucherOf(o, vno, due, bal) : null, counterfoil: bal > 0 ? counterfoilOf(o, vno, due, bal) : null,
    kv: [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Owner', o.name], ['Issued on', fd(today)], ['Due date', bal > 0 ? (due > today ? fd(due) : 'Overdue: please pay now') : 'Nothing due']],
    tables: [{ head: ['What is owed', 'Amount'], rows }],
    howToPay: howToPay(vno),
    fine: `While anything is overdue, a fine of ${feePct()}% of ${S().settings.rules.fineArrears ? 'all dues' : 'the unpaid bills'} applies. Dues left unpaid past the final deadline may lead to utilities being disconnected.`
  };
}

export function clearanceDoc(o: Owner, c: Clearance): DocData {
  const proj = S().proj;
  return {
    org: orgLine(), kind: 'clearance', filename: `Clearance-${c.no}.pdf`, project: proj.name, subtitle: proj.name, refNo: c.no, refSub: fd(c.d), certificate: 'DUES CLEARANCE CERTIFICATE',
    paras: [`This certifies that Apartment ${o.apt} (Block ${o.block}, ${o.type}), owned by ${o.name}, has no outstanding maintenance dues with Minawa Group as of ${fd(c.d)}.`, 'This certificate is required before a transfer NOC is issued.'],
    kv: [['Issued by', c.by], ['Ledger balance', rs(0)]], tables: []
  };
}
