// Sending by hand on WhatsApp Web: the building manager picks owners, the CRM writes each message with today's figures
// and how to pay, opens the owner's chat in WhatsApp Web with the text ready, and records it once the accountant has sent it.
// Bills, fines and balances still update automatically; the sending is always by hand.
// Everything here runs inside the engine (use(s, …)).
import { bankOf } from './bank';
import type { Message, Owner } from './types';
import { cur, balance, duesBreakdown, billsOf, unpaidMaint, periodLabel, ownerById, feePct } from './engine';
import { rs, fd, fill, addDays } from './fmt';
import { intl } from './dispatch';
import { docToken, type DocKind } from './doclink';

/** The CRM's public address, for the PDF links in messages (set by the action that writes them). */
let DOC_BASE = '';
export const setDocBase = (u: string) => { DOC_BASE = (u || '').replace(/\/$/, ''); };
/** The PDF that goes with a message, as a link the owner can open without signing in. */
function pdfLine(pdf: Message['pdf']) {
  if (!pdf || !DOC_BASE) return null;
  const url = `${DOC_BASE}/d/${docToken(cur().project, pdf.kind as DocKind, pdf.id)}`;
  return lines('', pdf.kind === 'receipt' ? '🧾 *Your payment receipt (PDF):*' : '📄 *Your bill voucher (PDF), with the due date:*', url);
}

export type SendType = 'link' | 'bill' | 'reminder' | 'notice' | 'receipt' | 'custom' | 'queue';
export const SEND_TYPES: { key: SendType; label: string; hint: string }[] = [
  { key: 'queue', label: 'Ready to send', hint: 'Bills, reminders, notices and receipts the CRM has prepared and nobody has sent yet' },
  { key: 'link', label: 'Dues', hint: 'What they owe today and how to pay' },
  { key: 'bill', label: 'Bill', hint: 'Their latest bill, with the full balance' },
  { key: 'reminder', label: 'Reminder', hint: 'A friendly reminder before the due date' },
  { key: 'notice', label: 'Final notice', hint: 'Overdue: pay by the final date or utilities are disconnected' },
  { key: 'receipt', label: 'Receipt', hint: 'Confirms their latest payment' },
  { key: 'custom', label: 'Own message', hint: 'Write it yourself; {{name}}, {{apt}}, {{total}} fill in for each owner' }
];
// A bill, reminder, final notice or dues message: only the newest one for an owner is worth sending.
const DUES = new Set(['bill', 'reminder', 'notice', 'link']);
const isDues = (m: Message) => DUES.has(m.kind) && m.tpl !== 'credit';

export interface SendItem {
  key: string; ownerId: string; apt: string; name: string; phone: string; to: string;
  kind: string; title: string; text: string;
  pdf: Message['pdf']; pdfHref: string | null; fromMsg: string | null; replaces: string[];
}


/** The owner's latest bill, the overdue state and what can be sent to them. */
export function ownerFacts(o: Owner) {
  const S = cur(), bal = balance(o), bills = billsOf(o);
  const late = bills.filter(b => unpaidMaint(b) > 0 && b.dueDate < S.today);
  const overdue = bal > 0 && (late.length > 0 || (o.openingLeft || 0) > 0);
  const pays = S.payments.filter(p => p.ownerId === o.id).sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
  return { bal, bill: bills[bills.length - 1] || null, late: late[late.length - 1] || null, overdue, lastPay: pays[pays.length - 1] || null };
}

/** Why a type can't go to this owner, or null if it can. */
export function cantSend(o: Owner, type: SendType): string | null {
  if (o.invalidPhone) return o.noPhone ? 'No WhatsApp number' : 'Number not on WhatsApp';
  if (type === 'custom' || type === 'queue') return null;
  if (o.exempt) return 'On hold';
  const f = ownerFacts(o);
  if (type === 'receipt') return f.lastPay ? null : 'No payment yet';
  if (type === 'bill') return f.bill ? null : 'No bill yet';
  if (f.bal <= 0) return 'Nothing owed';
  if (type === 'notice' && !f.overdue) return 'Not overdue';
  return null;
}

/* ---------- the WhatsApp text (sent by hand from WhatsApp Web) ----------
 * Every message has the same layout: a heading, a greeting, the flat's details (project, apartment, block, owner),
 * the message itself, the amounts as a list, how to pay, and a sign-off. *bold* and _italic_ are WhatsApp's own
 * formatting. Amounts are worked out again at send time, so they are always today's figures. */
/** "MRS. ROBINA SHAHID" → "Mrs. Robina Shahid"; names already in mixed case are kept as written. */
export function niceName(n: string) {
  const s = String(n || '').replace(/\s+/g, ' ').trim();
  if (!s || /[a-z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s(/&-])([a-z])/g, (_, a, c) => a + c.toUpperCase());
}
const RULE = '──────────────';
const lines = (...xs: (string | null | false | undefined)[]) => xs.filter(x => x !== null && x !== false && x !== undefined).join('\n');
function head(o: Owner, subtitle: string, intro: string, greet = true) {
  return lines(`*Minawa Group · Maintenance*`, `_${subtitle}_`, greet ? '' : null, greet ? `Dear ${niceName(o.name)},` : null, intro || null);
}
function details(o: Owner) {
  const S = cur();
  return lines('', `📍 *Project:* ${S.proj.name}`, `🏢 *Apartment:* ${o.apt}`, o.block ? `🧱 *Block:* ${o.block}` : null, `👤 *Owner:* ${niceName(o.name)}`);
}
function duesList(o: Owner, total: number) {
  const bd = duesBreakdown(o);
  return lines('', '*Your dues*', ...bd.rows.map(r => `• ${r.label}: ${rs(r.amount)}${r.sub ? ` _(${r.sub})_` : ''}`),
    bd.fee ? `• Late fine (${feePct()}%): ${rs(bd.fee)}` : null, RULE, `*Total to pay: ${rs(total)}*`);
}
/** How to pay: in cash to the building manager against a receipt, or by bank transfer to Minawa's account (when the
 *  Admin has set it in Settings); the owner gives the transaction ID to the building manager, who enters it. */
function payBlock() {
  const b = bankOf(cur().proj.bank);
  return lines('', '💵 *How to pay*', '• In cash to your building manager. Please bring this bill voucher and take a receipt.',
    b ? `• Or by bank transfer to *${b.title}*, ${b.bank}, A/C *${b.account}*. Please send the transaction ID to your building manager.` : null,
    b ? '• Only to this account: please do not pay into anyone\'s personal account.' : null);
}
const foot = () => lines('', 'For any questions, just reply to this message.', '', 'Thank you,', '*Minawa Group*', '_Maintenance Department_');

/** A maintenance notice (water, electricity, lift…) for one flat. */
function noticeText(o: Owner, title: string, text: string) {
  return lines(head(o, '🔧 Maintenance notice', 'Please note the following maintenance update for your building.'), details(o), '', `*${title}*`, text, foot());
}

interface Opts { title?: string; text?: string; pay?: boolean }
type Item = Omit<SendItem, 'key' | 'fromMsg' | 'replaces'>;
/** Writes one message of this type for the owner with today's figures. */
export function compose(o: Owner, type: Exclude<SendType, 'queue'>, d: string, t: string, opts: Opts = {}, billId?: string, payId?: string): Item | null {
  const S = cur(), f = ownerFacts(o), bal = f.bal;
  const base = { ownerId: o.id, apt: o.apt, name: o.name, phone: o.phone, to: intl(o.phone) };
  // The PDF goes in as a link just above the sign-off (the voucher with the due date, or the receipt).
  const withPdf = (text: string, pdf: Message['pdf']) => { const l = pdfLine(pdf), f = foot(); return l && text.endsWith(f) ? text.slice(0, -f.length) + l + '\n' + f : text; };
  const out = (kind: string, title: string, text: string, pdf: Message['pdf']): Item =>
    ({ ...base, kind, title, text: withPdf(text, pdf), pdf, pdfHref: pdf ? `/api/pdf/${S.project}/${pdf.kind}/${encodeURIComponent(pdf.id)}` : null });
  if (type === 'custom') {
    const l = opts.pay && bal > 0;
    const v = { name: niceName(o.name), apt: o.apt, block: o.block || '', project: S.proj.name, total: rs(Math.max(0, bal)), dues: rs(Math.max(0, bal)), due: f.bill ? fd(f.bill.dueDate) : '' };
    const title = opts.title || 'Message', body = fill(opts.text || '', v).trim(), greeted = /^(dear|hi|hello|assalam|salam|aoa)\b/i.test(body);
    // A message that starts with its own greeting puts the flat's details after it instead of adding a second "Dear …".
    return out('announcement', title, lines(head(o, title, '', false), greeted ? '' : null, greeted ? null : `\nDear ${niceName(o.name)},`, greeted ? body : null, details(o), greeted ? null : '', greeted ? null : body, l ? lines('', `*Amount due: ${rs(bal)}*`) : null, l ? payBlock() : null, foot()), null);
  }
  if (type === 'receipt') {
    const p = (payId && S.payments.find(x => x.id === payId)) || f.lastPay; if (!p) return null;
    const after = p.balAfter, l = after > 0 && bal > 0;   // "how to pay the rest" only if this payment left something owing
    const text = lines(head(o, '✅ Payment received', 'Thank you! We have received your maintenance payment.'), details(o), '',
      '*Payment details*', `• Amount received: *${rs(p.amount)}*`, `• Date: ${fd(p.d)}`, `• Receipt no: ${p.receipt}`, p.method ? `• Paid by: ${p.method}` : null, RULE,
      `*Remaining balance: ${after > 0 ? rs(after) : after < 0 ? `Rs 0 (advance credit ${rs(-after)})` : 'Rs 0, all paid up'}*`,
      l ? payBlock() : null, foot());
    return out('receipt', 'Payment received', text, { kind: 'receipt', id: p.id });
  }
  const b = (billId && S.bills.find(x => x.id === billId)) || f.bill;
  if (type === 'bill' && b && bal <= 0) {
    const text = lines(head(o, `🧾 Maintenance bill · ${periodLabel(b)}`, `Your maintenance bill for *${periodLabel(b)}* has been paid from your advance credit. Nothing is due.`), details(o), '',
      '*Bill details*', `• ${periodLabel(b)}: ${rs(b.net)}`, RULE, `*Advance credit left: ${rs(-bal)}*`, foot());
    return out('bill', `Bill · ${periodLabel(b)}`, text, { kind: 'bill', id: b.id });
  }
  if (bal <= 0) return null;
  if (type === 'bill' && b) {
    const text = lines(head(o, `🧾 Maintenance bill · ${periodLabel(b)}`, `Your maintenance bill for *${periodLabel(b)}* is ready: *${rs(b.net)}*, due by *${fd(b.dueDate)}*.`),
      details(o), duesList(o, bal), payBlock(), foot());
    return out('bill', `Bill · ${periodLabel(b)}`, text, { kind: 'bill', id: b.id });
  }
  if (type === 'reminder') {
    const due = f.bill ? fd(f.bill.dueDate) : fd(addDays(d, 7));
    const text = lines(head(o, '⏰ Payment reminder', `This is a friendly reminder that your maintenance is due on *${due}*.`), details(o), duesList(o, bal), payBlock(),
      '', '_If you have already paid, please ignore this message._', foot());
    return out('reminder', 'Reminder', text, { kind: 'statement', id: o.id });
  }
  if (type === 'notice') {
    const nb = f.late || f.bill, final = nb && nb.finalDate >= d ? nb.finalDate : addDays(d, 7);
    const text = lines(head(o, '⚠️ Final notice', 'Your maintenance dues are overdue.'), details(o), duesList(o, bal), '',
      `❗ *Please pay by ${fd(final)}*, otherwise your utilities will be disconnected.`, payBlock(), foot());
    return out('notice', 'Final notice', text, nb ? { kind: 'bill', id: nb.id } : { kind: 'statement', id: o.id });
  }
  const text = lines(head(o, '💳 Your dues', 'Here are your maintenance dues as of today.'), details(o), duesList(o, bal), payBlock(), foot());
  return out('link', 'Your dues', text, { kind: 'statement', id: o.id });
}

/** Messages the CRM prepared that are waiting to be sent by hand, grouped per owner: the newest dues message (bill,
 *  reminder, notice or dues message) replaces older ones; receipts and notices each stand alone. */
export function pendingGroups(filter?: (m: Message) => boolean) {
  const S = cur(), by = new Map<string, Message[]>();
  for (const m of S.messages) if (m.status === 'pending' && m.from === 'biz' && (!filter || filter(m))) {
    const k = isDues(m) ? `${m.ownerId}:dues` : m.id;
    by.set(k, [...(by.get(k) || []), m]);
  }
  return [...by.values()].map(list => {
    list.sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
    return { msg: list[list.length - 1], older: list.slice(0, -1) };
  });
}
/** To do: the messages waiting to be sent by hand, in groups (bills, the reminders on the 3rd and 7th…). */
export const TODO_GROUPS: { key: string; label: string; hint: string; kinds: string[] }[] = [
  { key: 'bill', label: 'Monthly bills', hint: 'First alert: the bill made on the customer\'s billing date', kinds: ['bill'] },
  { key: 'reminder', label: 'Reminders', hint: 'Unpaid bills, on the 3rd and 7th of the due month', kinds: ['reminder'] },
  { key: 'notice', label: 'Final notices', hint: 'Unpaid after the due date: the fine is added', kinds: ['notice'] },
  { key: 'receipt', label: 'Payment confirmations', hint: 'Payments the Accountant confirmed: send each owner their receipt (PDF)', kinds: ['receipt'] },
  { key: 'link', label: 'Dues messages', hint: 'Updated dues and how to pay', kinds: ['link'] },
  { key: 'other', label: 'Notices and messages', hint: 'Maintenance notices and announcements', kinds: ['alert', 'announcement', 'info', 'statement', 'reply'] }
];
export const toDoKinds = (key: string) => TODO_GROUPS.find(g => g.key === key)?.kinds || [key];
/** For To do: how many owners are waiting for each group, and since when. */
export function toDoGroups() {
  const by = new Map<string, { n: number; since: string }>();
  for (const g of pendingGroups()) {
    const grp = TODO_GROUPS.find(x => x.kinds.includes(g.msg.kind))?.key || 'other';
    const first = [g.msg, ...g.older].map(m => m.d).sort()[0], cur0 = by.get(grp);
    by.set(grp, { n: (cur0?.n || 0) + 1, since: cur0 && cur0.since < first ? cur0.since : first });
  }
  return TODO_GROUPS.filter(g => by.has(g.key)).map(g => ({ ...g, ...by.get(g.key)! }));
}
/** How many owners have something waiting to be sent by hand (the tab's badge). */
export const pendingCount = () => new Set(pendingGroups().map(g => g.msg.ownerId)).size;

/** One prepared message, written again with today's figures where it's about money owed. */
export function composeQueued(m: Message, d: string, t: string): Omit<SendItem, 'key' | 'fromMsg' | 'replaces'> | null {
  const S = cur(), o = ownerById(m.ownerId);
  if (!o) return null;
  if (isDues(m)) return compose(o, m.kind as 'bill' | 'reminder' | 'notice' | 'link', d, t, {}, m.kind === 'bill' ? m.pdf?.id : undefined);
  if (m.kind === 'bill') return compose(o, 'bill', d, t, {}, m.pdf?.id);   // a bill paid from credit
  if (m.kind === 'receipt') return { ...compose(o, 'receipt', d, t, {}, undefined, m.pdf?.id)!, kind: m.kind, title: m.title };
  // A maintenance notice: its title and text in the full layout, with this flat's details.
  const v = m.vars || {};
  const text = m.kind === 'alert' && v.title ? noticeText(o, v.title, v.text || '')
    : lines(head(o, m.title || 'Message', ''), details(o), '', m.text.trim(), foot());
  return { ownerId: o.id, apt: o.apt, name: o.name, phone: o.phone, to: intl(o.phone), kind: m.kind, title: m.title, text,
    pdf: m.pdf, pdfHref: m.pdf ? `/api/pdf/${S.project}/${m.pdf.kind}/${encodeURIComponent(m.pdf.id)}` : null };
}
