// Sending by hand on WhatsApp Web: the accountant picks owners, the CRM writes each message with today's figures and a
// Pay Now link, opens the owner's chat in WhatsApp Web with the text ready, and records it once the accountant has sent it.
// Bills, fines and balances still update automatically; only the sending is by hand (rules.autoSend off).
// Everything here runs inside the engine (use(s, …)).
import type { Message, Owner } from './types';
import { cur, balance, activeLink, createLink, duesBreakdown, bdVars, billsOf, unpaidMaint, periodLabel, ownerById } from './engine';
import { first, rs, fd, fill, addDays } from './fmt';
import { intl } from './dispatch';

export type SendType = 'link' | 'bill' | 'reminder' | 'notice' | 'receipt' | 'custom' | 'queue';
export const SEND_TYPES: { key: SendType; label: string; hint: string }[] = [
  { key: 'queue', label: 'Ready to send', hint: 'Bills, reminders, notices and receipts the CRM has prepared and nobody has sent yet' },
  { key: 'link', label: 'Payment link', hint: 'What they owe today, with a Pay Now link for exactly that amount' },
  { key: 'bill', label: 'Bill', hint: 'Their latest bill, with a Pay Now link for the full balance' },
  { key: 'reminder', label: 'Reminder', hint: 'A friendly reminder before the due date' },
  { key: 'notice', label: 'Final notice', hint: 'Overdue: pay by the final date or utilities are disconnected' },
  { key: 'receipt', label: 'Receipt', hint: 'Confirms their latest payment' },
  { key: 'custom', label: 'Own message', hint: 'Write it yourself; {{name}}, {{apt}}, {{total}} fill in for each owner' }
];
// A bill, reminder, final notice or payment link: only the newest one for an owner is worth sending.
const DUES = new Set(['bill', 'reminder', 'notice', 'link']);
const isDues = (m: Message) => DUES.has(m.kind) && m.tpl !== 'credit';

export interface SendItem {
  key: string; ownerId: string; apt: string; name: string; phone: string; to: string;
  kind: string; title: string; text: string; linkId: string | null; payUrl: string | null;
  pdf: Message['pdf']; pdfHref: string | null; fromMsg: string | null; replaces: string[];
}

export const appUrl = () => (process.env.APP_URL || '').replace(/\/$/, '');
export const payUrlOf = (linkId: string | null) => {
  if (!linkId) return null;
  const l = cur().links.find(x => x.id === linkId);
  return appUrl() ? `${appUrl()}/pay/${linkId}` : l?.sp?.url || null;
};

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

/** A link for exactly what the owner owes now: the active one if it still matches, otherwise a new one. */
function linkFor(o: Owner, d: string, t: string) {
  const bal = balance(o);
  if (bal <= 0) return null;
  const l = activeLink(o);
  return l && l.amount === bal ? l : createLink(o, d, t, bal, 'replaced by a new payment link');
}

/** WhatsApp Web can't attach the PDF or show a Pay Now button, so: no "attached", and the link goes in the text. */
export function forHand(text: string, url: string | null) {
  let out = text.replace(/Your statement is attached\. */g, '').replace(/ *Your receipt is attached\./g, '').replace(/[ \t]+\n/g, '\n').replace(/ +$/gm, '');
  let placed = false;
  out = out.replace(/Tap Pay Now to pay by debit or credit card\. */g, () => { placed = !!url; return url ? `Pay by debit or credit card here:\n${url}\n\n` : ''; });
  out = out.replace(/Tap Pay Now to pay the rest\./g, () => { placed = !!url; return url ? `Pay the rest here: ${url}` : ''; });
  if (url && !placed && !out.includes(url)) out += `\n\nPay Now: ${url}`;
  return out.replace(/\n +/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

interface Opts { title?: string; text?: string; pay?: boolean }
/** Writes one message of this type for the owner with today's figures. Creates the payment link it needs. */
export function compose(o: Owner, type: Exclude<SendType, 'queue'>, d: string, t: string, opts: Opts = {}, billId?: string): Omit<SendItem, 'key' | 'fromMsg' | 'replaces'> | null {
  const S = cur(), f = ownerFacts(o), T = S.templates, bal = f.bal;
  const base = { ownerId: o.id, apt: o.apt, name: o.name, phone: o.phone, to: intl(o.phone) };
  const out = (kind: string, title: string, raw: string, linkId: string | null, pdf: Message['pdf']) => {
    const payUrl = payUrlOf(linkId);
    return { ...base, kind, title, text: forHand(raw, payUrl), linkId, payUrl, pdf, pdfHref: pdf ? `/api/pdf/${S.project}/${pdf.kind}/${encodeURIComponent(pdf.id)}` : null };
  };
  if (type === 'custom') {
    const l = opts.pay ? linkFor(o, d, t) : null;
    const v = { name: first(o.name), apt: o.apt, project: S.proj.name, total: rs(Math.max(0, bal)), dues: rs(Math.max(0, bal)), due: f.bill ? fd(f.bill.dueDate) : '' };
    return out('announcement', opts.title || 'Message', fill(opts.text || '', v), l?.id || null, null);
  }
  if (type === 'receipt') {
    const p = f.lastPay; if (!p) return null;
    const after = p.balAfter;
    const v = { name: first(o.name), paid: rs(p.amount), apt: o.apt, date: fd(p.d), balance: after > 0 ? rs(after) : after < 0 ? `Rs 0 (credit ${rs(-after)})` : 'Rs 0' };
    const l = after > 0 && bal > 0 ? linkFor(o, d, t) : null;   // "pay the rest" only if this payment left something owing
    return out('receipt', 'Payment received', fill(T.receipt.text, v) + (l ? '\nTap Pay Now to pay the rest.' : ''), l?.id || null, { kind: 'receipt', id: p.id });
  }
  const b = (billId && S.bills.find(x => x.id === billId)) || f.bill;
  if (type === 'bill' && b && bal <= 0) {
    const v = { name: first(o.name), month: periodLabel(b), amount: rs(b.net), apt: o.apt, credit: rs(-bal) };
    return out('bill', `Bill · ${periodLabel(b)}`, fill(T.credit.text, v), null, { kind: 'bill', id: b.id });
  }
  if (bal <= 0) return null;
  const l = linkFor(o, d, t)!, bd = duesBreakdown(o), v0 = { name: first(o.name), apt: o.apt, ...bdVars(bd), total: rs(bal) };
  if (type === 'bill' && b) return out('bill', `Bill · ${periodLabel(b)}`, fill(T.bill.text, { ...v0, month: periodLabel(b), amount: rs(b.net), due: fd(b.dueDate) }), l.id, { kind: 'bill', id: b.id });
  if (type === 'reminder') return out('reminder', 'Reminder', fill(T.reminder.text, { ...v0, due: f.bill ? fd(f.bill.dueDate) : fd(addDays(d, 7)) }), l.id, { kind: 'statement', id: o.id });
  if (type === 'notice') {
    const nb = f.late || f.bill, final = nb && nb.finalDate >= d ? nb.finalDate : addDays(d, 7);
    return out('notice', 'Final notice', fill(T.notice.text, { ...v0, month: nb ? periodLabel(nb) : '', final: fd(final) }), l.id, nb ? { kind: 'bill', id: nb.id } : { kind: 'statement', id: o.id });
  }
  return out('link', 'Payment link', fill(T.link.text, v0), l.id, { kind: 'statement', id: o.id });
}

/** Messages the CRM prepared that are waiting to be sent by hand, grouped per owner: the newest dues message (bill,
 *  reminder, notice or link) replaces older ones; receipts and notices each stand alone. */
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
/** How many owners have something waiting to be sent by hand (the tab's badge). */
export const pendingCount = () => new Set(pendingGroups().map(g => g.msg.ownerId)).size;

/** One prepared message, written again with today's figures where it's about money owed. */
export function composeQueued(m: Message, d: string, t: string): Omit<SendItem, 'key' | 'fromMsg' | 'replaces'> | null {
  const S = cur(), o = ownerById(m.ownerId);
  if (!o) return null;
  if (isDues(m)) return compose(o, m.kind as 'bill' | 'reminder' | 'notice' | 'link', d, t, {}, m.kind === 'bill' ? m.pdf?.id : undefined);
  let linkId = m.linkId;
  if (m.kind === 'receipt') linkId = /Tap Pay Now/.test(m.text) && balance(o) > 0 ? linkFor(o, d, t)?.id || null : null;
  else if (linkId && S.links.find(l => l.id === linkId)?.status !== 'active') linkId = null;
  const payUrl = payUrlOf(linkId);
  // A maintenance notice or announcement: the full approved wording (the history keeps a short version).
  const tpl = m.tpl && m.vars && m.kind !== 'receipt' ? S.templates[m.tpl] : null, raw = tpl ? fill(tpl.text, m.vars!) : m.text;
  return { ownerId: o.id, apt: o.apt, name: o.name, phone: o.phone, to: intl(o.phone), kind: m.kind, title: m.title, text: forHand(raw, payUrl), linkId, payUrl,
    pdf: m.pdf, pdfHref: m.pdf ? `/api/pdf/${S.project}/${m.pdf.kind}/${encodeURIComponent(m.pdf.id)}` : null };
}
