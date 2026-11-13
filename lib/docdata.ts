// The content of each document (bill, receipt, statement, clearance), worked out once and drawn twice:
// on screen (components/Docs.tsx, the demo's .doc look) and as the PDF sent on WhatsApp (lib/pdf.tsx).
// Call inside use(state, …).
import type { Bill, Payment, Owner, PayLink, Clearance } from './types';
import { cur, ownerById, duesBreakdown, balance, feePct, periodLabel } from './engine';
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
}
/** Company line printed at the foot of every document. */
export function orgLine() { const c = cur().company; if (!c) return ''; return [c.legalName, c.address, c.ntn ? `NTN ${c.ntn}` : '', c.phone, c.email].filter(Boolean).join(' · '); }
const S = () => cur();
const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');

export function billDoc(b: Bill): DocData {
  const o = ownerById(b.ownerId), proj = S().proj;
  const l = [...S().links].reverse().find(x => x.ownerId === o.id && x.created >= b.billDate);
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
  return {
    org: orgLine(), kind: 'bill', filename: `Bill-${b.period}${b.months > 1 ? '-' + b.periodEnd : ''}-${o.apt}.pdf`, project: proj.name, subtitle: `${proj.name} · Maintenance bill`, refNo: b.id, refSub: periodLabel(b),
    kv: [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Owner', o.name], ['Billing date', fd(b.billDate)], ['Due date', fd(b.dueDate)]],
    tables,
    howToPay: [`Tap Pay Now in the WhatsApp message${l ? ` (link ${l.id})` : ''} to pay by debit or credit card.`, `Or transfer to ${proj.bank || 'Minawa Group\'s maintenance account'}, reference ${o.apt}-${fmShort(b.period)}.`],
    fine: `If anything is still unpaid after ${fd(b.dueDate)}, a fine of ${feePct()}% of ${S().settings.rules.fineArrears ? 'all dues' : 'the unpaid bills'} is added. If dues remain unpaid by ${fd(b.finalDate)}, utilities may be disconnected.`
  };
}

export const spInfo = (p: Payment) => p.source === 'link' && p.gateway ? { mode: p.gwMode, link: p.spLink, tracker: p.spTracker, payLink: p.linkId } : null;

export function receiptDoc(p: Payment): DocData {
  const o = ownerById(p.ownerId), sp = spInfo(p), proj = S().proj;
  const stamp = sp
    ? { sp: true, title: 'Received through Safepay', text: `Card payment confirmed by Safepay${sp.mode === 'sandbox' ? ' (sandbox)' : sp.mode === 'simulated' ? ' (simulated)' : ''}`, amount: rs(p.amount) }
    : { sp: false, title: `Received · ${p.method.replace(' (screenshot checked)', '')}`, text: p.source === 'proof' ? `Transfer checked against the bank statement by ${p.by}` : `Paid into Minawa Group's bank account, recorded by ${p.by}`, amount: rs(p.amount) };
  const kv: [string, string][] = [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Received from', `${o.name}, owner`], ['Paid on', `${fd(p.d)}, ${p.t}`],
    ['Payment method', sp ? 'Debit or credit card, Pay Now link' : p.method]];
  if (sp) kv.push(['Safepay tracker', sp.tracker || 'None: simulated payment'], ['Safepay payment link', sp.link || sp.payLink || '–']);
  else kv.push(['Bank reference', p.ref], ['Payment ID', p.id]);
  const rank = { dues: 0, fee: 1, credit: 2 }, rows = (p.applied || []).slice().sort((a, b) => rank[a.kind] - rank[b.kind]);
  const bal = p.balAfter < 0 ? `${rs(-p.balAfter)} advance credit` : p.balAfter > 0 ? rs(p.balAfter) : 'Rs 0 · all paid';
  return {
    org: orgLine(), kind: 'receipt', filename: `Receipt-${p.receipt}.pdf`, project: proj.name, subtitle: `${proj.name} · Payment receipt`, refNo: p.receipt, refSub: `${fd(p.d)}, ${p.t}`, stamp, kv,
    tables: [
      { head: ['This payment paid', 'Amount'], rows: [...(rows.length ? rows.map(r => ({ label: r.label, amount: rs(r.amount) })) : [{ label: 'Maintenance dues, oldest first', amount: rs(p.amount) }]), { label: 'Amount received', amount: rs(p.amount), tot: true }] },
      { rows: [...(p.before != null ? [{ label: 'Owed before this payment', amount: p.before < 0 ? `${rs(-p.before)} credit` : rs(p.before) }] : []), { label: 'Balance now', amount: bal, bold: true }] }
    ],
    foot: `${sp ? 'Recorded automatically the moment Safepay confirmed the payment. Nobody had to check a screenshot.' : p.source === 'proof' ? `Recorded by ${p.by} after matching the owner's screenshot to the bank statement.` : `Recorded in the panel by ${p.by}.`} Dues are paid oldest first; the ${feePct()}% late fee is paid in proportion.`
  };
}

export function statementDoc(o: Owner, l?: PayLink | null): DocData {
  const bd = duesBreakdown(o), bal = balance(o), proj = S().proj, today = S().today;
  const rows: DocRow[] = bd.rows.map(r => ({ label: r.label, sub: r.sub, amount: rs(r.amount) }));
  rows.push({ label: 'Dues', amount: rs(bd.dues), bold: true });
  if (bd.fee) rows.push({ label: `Fine ${feePct()}%`, sub: `of ${rs(bd.dues)} dues`, amount: rs(bd.fee) });
  rows.push({ label: 'Total to pay', amount: rs(bal), tot: true });
  const url = l ? (appUrl() ? `${appUrl()}/pay/${l.id}` : l.sp?.url) : null;
  return {
    org: orgLine(), kind: 'statement', filename: `Statement-${o.apt}-${today}.pdf`, project: proj.name, subtitle: `${proj.name} · Statement of dues`, refNo: `Apt ${o.apt}`, refSub: fd(today),
    kv: [['Apartment', `${o.apt} · Block ${o.block} · ${o.type}`], ['Owner', o.name], ['Statement date', fd(today)], ['Payment link', l ? l.id : '–']],
    tables: [{ head: ['What is owed', 'Amount'], rows }],
    howToPay: [url ? `Open the payment link to pay by debit or credit card: ${url}` : 'Tap the payment link in the WhatsApp message to pay by debit or credit card.', `Or transfer to ${proj.bank || 'Minawa Group\'s maintenance account'}, reference ${o.apt}.`],
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
