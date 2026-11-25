// The content of each document (bill, receipt, statement, clearance), worked out once and drawn twice:
// on screen (components/Docs.tsx, the demo's .doc look) and as the PDF sent on WhatsApp (lib/pdf.tsx).
// Call inside use(state, …).
import { bankOf, bankLine } from './bank';
import type { Bill, Payment, Owner, Clearance } from './types';
import { t12 } from '@/lib/fmt';
import { cur, ownerById, duesBreakdown, balance, feePct, periodLabel, billsOf, unpaidMaint, openingDue, fineBase } from './engine';
import { fd, fm, fmShort, rs, periodText } from './fmt';

export interface DocRow { label: string; sub?: string; amount: string; bold?: boolean; tot?: boolean }
export interface DocData {
  kind: 'bill' | 'receipt' | 'statement' | 'clearance' | 'history' | 'apthistory' | 'account' | 'closing';
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
  /** Multi-column tables (payment and apartment history, Phase 4). `right`: the columns aligned right; `total`: the last row is a total. */
  grids?: { title: string; cols: string[]; rows: string[][]; widths?: number[]; right?: number[]; total?: boolean; empty?: string }[];
  /** Photos printed on the document (21 Nov 2026: the electricity bill photo). `src` (a data: URI) is filled in by the
   *  PDF routes just before printing. */
  photos?: { title: string; id: string; src?: string | null }[];
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
/** How an owner pays: in cash to the building manager against a receipt, or by bank transfer to Minawa's account. */
const howToPay = (ref: string) => { const b = bankOf(S().proj.bank); return [`Pay in cash to your building manager and show this voucher (${ref}). They keep the office copy and give you a receipt.`,
  ...(b ? [`Or pay by bank transfer to ${bankLine(b)}, and give the transaction ID to your building manager. Only to this account: never into a personal account.`] : []),
  'Your payment receipt is sent to you on WhatsApp once it is confirmed.']; };

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
    photos: b.photoId ? [{ title: 'Photo of the bill', id: b.photoId }] : undefined,
    fine: `If anything is still unpaid after ${fd(b.dueDate)}, a fine of ${feePct()}% of ${S().settings.rules.fineArrears ? 'all dues' : 'the unpaid bills'} is added. If dues remain unpaid by ${fd(b.finalDate)}, utilities may be disconnected.`
  };
}

export function receiptDoc(p: Payment): DocData {
  const o = ownerById(p.ownerId), proj = S().proj;
  const stamp = { sp: false, title: `Received · ${p.method.replace(' (screenshot checked)', '')}`, text: `${/bank/i.test(p.method) ? 'Paid by bank transfer' : 'Paid in cash'} · ${p.enteredBy ? `entered by ${p.enteredBy}${p.approvedBy && p.approvedBy !== p.enteredBy ? `, approved by ${p.approvedBy}` : ''}` : `recorded by ${p.by}`}`, amount: rs(p.amount) };
  const kv: [string, string][] = [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Received from', `${o.name}, owner`], ['Paid on', `${fd(p.d)}, ${t12(p.t)}`], ...(p.periodFrom ? [['Paid for', `${periodText(p.periodFrom, p.periodTo)}${p.forWhat === 'electricity' ? ' · electricity' : ' · maintenance'}`] as [string, string]] : []),
    ['Payment method', p.method], ['Reference', p.ref], ...(p.txn ? [['Bank transaction ID', p.txn] as [string, string]] : []), ['Payment ID', p.id]];
  const rank = { dues: 0, fee: 1, credit: 2 }, rows = (p.applied || []).slice().sort((a, b) => rank[a.kind] - rank[b.kind]);
  const bal = p.balAfter < 0 ? `${rs(-p.balAfter)} advance credit` : p.balAfter > 0 ? rs(p.balAfter) : 'Rs 0 · all paid';
  return {
    org: orgLine(), kind: 'receipt', filename: `Receipt-${p.receipt}.pdf`, project: proj.name, subtitle: `${proj.name} · Payment receipt`, refNo: p.receipt, refSub: `${fd(p.d)}, ${p.t}`, stamp, kv,
    tables: [
      { head: ['This payment paid', 'Amount'], rows: [...(rows.length ? rows.map(r => ({ label: r.label, amount: rs(r.amount) })) : [{ label: 'Maintenance dues, oldest first', amount: rs(p.amount) }]), { label: 'Amount received', amount: rs(p.amount), tot: true }] },
      { rows: [...(p.before != null ? [{ label: 'Owed before this payment', amount: p.before < 0 ? `${rs(-p.before)} credit` : rs(p.before) }] : []), { label: 'Balance now', amount: bal, bold: true }] }
    ],
    foot: `${p.entryId ? `${/bank/i.test(p.method) ? 'Bank transfer' : 'Cash'} received by the building manager (${p.enteredBy || p.by})${p.approvedBy ? ` and confirmed by the Accountant (${p.approvedBy})` : ''}.` : p.source === 'proof' ? `Cash received by the building manager and confirmed by the Accountant (${p.by}).` : `${/bank/i.test(p.method) ? 'Payment' : 'Cash'} recorded in the CRM by ${p.by}.`} Dues are paid oldest first; the ${feePct()}% late fee is paid in proportion.`
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

/* ---------- Phase 4: payment history and apartment history ---------- */
const who = (p: Payment) => {
  if (p.enteredBy || p.approvedBy) return [p.enteredBy || '', p.approvedBy || ''];
  const m = /^(.*?), (?:checked|approved) by (.*)$/.exec(p.by || ''); return m ? [m[1], m[2]] : [p.by || '', p.by || ''];
};
/** A customer's whole account with Minawa: every bill (maintenance, generator, discount, utilities, corrections), every
 *  payment (with who entered and who approved it), fines and adjustments, and the totals. */
export function historyDoc(o: Owner): DocData {
  const S0 = S(), proj = S0.proj, today = S0.today, bills = billsOf(o), pays = S0.payments.filter(p => p.ownerId === o.id).sort((a, b) => `${a.d}${a.t}`.localeCompare(`${b.d}${b.t}`));
  const ent = S0.entries.filter(e => e.ownerId === o.id);
  const sum = (k: string) => ent.filter(e => e.kind === k).reduce((a, e) => a + e.amount, 0);
  const line = (b: Bill, k: string) => b.lines.filter(l => l.kind === k).reduce((a, l) => a + l.amount, 0);
  const billRows = bills.map(b => [b.id, periodLabel(b), fd(b.billDate), fd(b.dueDate), rs(line(b, 'maintenance')), line(b, 'generator') ? rs(line(b, 'generator')) : '—', line(b, 'discount') ? rs(line(b, 'discount')) : '—',
    (line(b, 'utility') + line(b, 'correction')) ? rs(line(b, 'utility') + line(b, 'correction')) : '—', rs(b.net), rs(b.paid), rs(Math.max(0, b.net - b.paid))]);
  if (bills.length) billRows.push(['Total', '', '', '', '', '', '', '', rs(bills.reduce((a, b) => a + b.net, 0)), rs(bills.reduce((a, b) => a + b.paid, 0)), rs(bills.reduce((a, b) => a + Math.max(0, b.net - b.paid), 0))]);
  const payRows = pays.map(p => { const [e, a] = who(p); return [fd(p.d), p.receipt, rs(p.amount), /bank/i.test(p.method) ? 'Bank transfer' : 'Cash', p.txn || p.ref || '', e, a]; });
  if (pays.length) payRows.push(['Total', '', rs(pays.reduce((a, p) => a + p.amount, 0)), '', '', '', '']);
  const other = ent.filter(e => ['fine', 'adjustment', 'reversal', 'discount'].includes(e.kind) && !(e.kind === 'discount' && e.ref)).sort((a, b) => a.d.localeCompare(b.d))
    .map(e => [fd(e.d), e.kind === 'fine' ? 'Fine' : e.kind === 'reversal' ? 'Payment reversed' : e.kind === 'discount' ? 'Discount' : 'Adjustment', e.desc, rs(e.amount)]);
  const bal = balance(o), billed = sum('bill') + sum('utility'), fines = sum('fine'), disc = -sum('discount'), adj = sum('adjustment') + sum('reversal');
  return {
    org: orgLine(), kind: 'history', filename: `Payment-history-${o.apt}-${today}.pdf`, project: proj.name, subtitle: `${proj.name} · Payment history`, refNo: o.apt, refSub: `As of ${fd(today)}`,
    kv: [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Customer', o.name], ['In possession', `${o.possessionKnown ? fd(o.possession) : 'before the office list'}${o.closedOn ? ` – ${fd(o.closedOn)}` : ' – now'}`],
      ['Plan', ({ monthly: 'Monthly', quarterly: 'Quarterly', sixmonthly: 'Every 6 months', annual: 'Yearly' } as Record<string, string>)[o.plan || 'monthly']], ['Fine rate now', `${feePct()}% of what is late`],
      ['Discount', o.discount ? (o.discount.kind === 'pct' ? `${o.discount.value}%` : rs(o.discount.value)) : 'None'], ...(o.generator ? [['Generator', 'On the Generator list'] as [string, string]] : [])],
    tables: [{ head: ['Summary', 'Amount'], rows: [
      { label: 'Earlier dues from the office list', amount: rs(o.opening || 0) },
      { label: 'Billed in the CRM', sub: 'maintenance, generator, utilities, corrections', amount: rs(billed) },
      { label: 'Discounts', amount: disc ? `− ${rs(disc)}` : rs(0) },
      { label: 'Fines', amount: rs(fines) },
      { label: 'Adjustments and reversals', amount: rs(adj) },
      { label: 'Paid', amount: `− ${rs(pays.reduce((a, p) => a + p.amount, 0))}` },
      { label: bal < 0 ? 'Advance credit' : 'Balance', amount: rs(Math.abs(bal)), tot: true }] }],
    grids: [
      { title: 'Bills', cols: ['Bill', 'Period', 'Made', 'Due', 'Maint.', 'Generator', 'Discount', 'Other', 'Total', 'Paid', 'Unpaid'], rows: billRows, widths: [1.1, 2.2, 1.2, 1.2, 1, 1, 1, 1, 1, 1, 1], right: [4, 5, 6, 7, 8, 9, 10], total: bills.length > 0, empty: 'No bills in the CRM yet.' },
      { title: 'Payments', cols: ['Date', 'Receipt', 'Amount', 'Received as', 'Reference', 'Entered by', 'Approved by'], rows: payRows, widths: [1.1, 1.2, 1, 1.1, 1.4, 1.4, 1.4], right: [2], total: pays.length > 0, empty: 'No payments in the CRM yet.' },
      { title: 'Fines, discounts and adjustments', cols: ['Date', 'What', 'Details', 'Amount'], rows: other, widths: [1, 1, 4, 1], right: [3], empty: 'None.' }],
    foot: 'Earlier dues are the balance on the office list when the CRM started. Bills show what was charged at the time; later rate changes never change them.'
  };
}
/** Who held an apartment and when: each customer with possession and leaving dates, meter readings, what was billed
 *  and paid, and the balance; plus the apartment's electricity bills. */
export function aptHistoryDoc(o: Owner): DocData {
  const S0 = S(), proj = S0.proj, today = S0.today, unit = o.unit || `${o.project}:${o.apt}`;
  const accts = S0.owners.filter(x => (x.unit || `${x.project}:${x.apt}`) === unit).sort((a, b) => (a.possession || '').localeCompare(b.possession || ''));
  const rows = accts.map(a => {
    const bills = billsOf(a), paid = S0.payments.filter(p => p.ownerId === a.id).reduce((t, p) => t + p.amount, 0), c = S0.clearances.find(x => x.ownerId === a.id);
    return [a.name, a.possessionKnown ? fd(a.possession) : 'Before the office list', a.closedOn ? fd(a.closedOn) : 'Now', a.meterIn ? String(a.meterIn.reading) : '—', a.meterOut ? String(a.meterOut.reading) : '—',
      rs((a.opening || 0) + bills.reduce((t, b) => t + b.net, 0)), rs(paid), rs(balance(a)), c ? c.no : '—'];
  });
  const elec = accts.flatMap(a => billsOf(a).filter(b => !b.months).map(b => [fm(b.period), a.name, b.lines.filter(l => l.kind === 'utility').map(l => l.label.replace(/^[^,]+, [A-Za-z]+ \d{4} ?/, '').replace(/[()]/g, '')).join('; ') || '—', rs(b.net), rs(b.paid), fd(b.dueDate)]));
  const cur0 = accts.find(a => a.status === 'active');
  return {
    org: orgLine(), kind: 'apthistory', filename: `Apartment-history-${o.apt}-${today}.pdf`, project: proj.name, subtitle: `${proj.name} · Apartment history`, refNo: o.apt, refSub: `As of ${fd(today)}`,
    kv: [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Now', cur0 ? `${cur0.name} (since ${cur0.possessionKnown ? fd(cur0.possession) : 'before the office list'})` : 'Vacant'], ['Customers on record', String(accts.length)]],
    tables: [],
    grids: [
      { title: 'Who held the apartment', cols: ['Customer', 'From', 'To', 'Meter in', 'Meter out', 'Billed', 'Paid', 'Balance', 'Clearance'], rows, widths: [2, 1.3, 1.1, 0.9, 0.9, 1.1, 1.1, 1.1, 1.1], right: [5, 6, 7] },
      ...(elec.length ? [{ title: 'Electricity bills', cols: ['Month', 'Customer', 'Meter / units', 'Amount', 'Paid', 'Due'], rows: elec, widths: [1.1, 1.8, 2.6, 1, 1, 1.1], right: [3, 4] }] : [])],
    foot: 'Billed includes the earlier dues from the office list. Balance: what the customer still owes (a negative balance is advance credit).'
  };
}
