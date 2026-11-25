// Sending by hand on WhatsApp Web: the building manager picks owners, the CRM writes each message with today's figures
// and how to pay, opens the owner's chat in WhatsApp Web with the text ready, and records it once the accountant has sent it.
// Bills, fines and balances still update automatically; the sending is always by hand.
// Everything here runs inside the engine (use(s, …)).
import { bankOf } from './bank';
import type { Message, Owner } from './types';
import { cur, balance, duesBreakdown, billsOf, unpaidMaint, periodLabel, ownerById, feePct, fineOffer, utilKind, isUtilBill, elecDue } from './engine';
import { rs, fd, fm, fill, addDays, periodText } from './fmt';
import { intl } from './dispatch';
import { docToken, type DocKind } from './doclink';

/** The CRM's public address, for the PDF links in messages (set by the action that writes them). */
let DOC_BASE = '';
export const setDocBase = (u: string) => { DOC_BASE = (u || '').replace(/\/$/, ''); };
/** Whether photos can be added (set by the server before composing; see lib/images.ts photoStore). */
let PHOTOS_ON = false;
export const setPhotosOn = (on: boolean) => { PHOTOS_ON = on; };
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
  { key: 'notice', label: 'Late payment warning', hint: 'Unpaid 15 days after the due date: you can add the fine when sending' },
  { key: 'receipt', label: 'Receipt', hint: 'Confirms their latest payment' },
  { key: 'custom', label: 'Own message', hint: 'Write it yourself; {{name}}, {{apt}}, {{total}} fill in for each owner' }
];
// A bill, reminder, final notice or dues message: only the newest one for an owner is worth sending.
const DUES = new Set(['bill', 'reminder', 'notice', 'link']);
const isDues = (m: Message) => DUES.has(m.kind) && m.tpl !== 'credit';
/** About an electricity bill (its bill or its reminder, 21 Nov 2026): a track of its own, so a maintenance reminder
 *  never hides a waiting electricity bill (and the other way round). */
export const isElecMsg = (m: Message) => m.tpl === 'elec' || (m.pdf?.kind === 'bill' && cur().bills.some(b => b.id === m.pdf!.id && isUtilBill(b)));

export interface SendItem {
  key: string; ownerId: string; apt: string; name: string; phone: string; to: string;
  kind: string; title: string; text: string;
  pdf: Message['pdf']; pdfHref: string | null; fromMsg: string | null; replaces: string[];
  /** Late warnings and reminders: the fine the building manager can add before sending (pct of what is late). */
  fine?: { pct: number; offer: number; added: number } | null;
  /** The staff member's WhatsApp number the chat was opened from (the daily limit, 20 Nov 2026). */
  from?: string | null;
  /** Electricity bills and their reminders (21 Nov 2026): the bill and its photo (printed on the bill PDF). */
  billPhoto?: { billId: string; id: string | null; photos: boolean } | null;
  /** One chat for several flats on the same phone number (21 Nov 2026): the messages it stands for. */
  parts?: SendItem[] | null;
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
/** Bills and late warnings (20 Nov 2026) ask for a reply: a reply shows the message arrived, and WhatsApp doesn't count
 *  messages that get a reply against its limit on messages to people who don't answer. */
const replyFoot = () => lines('', '🙏 *Please reply OK* once you have seen this message, so we know it reached you.', foot());

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
  const withPdf = (text: string, pdf: Message['pdf']) => { const l = pdfLine(pdf), rf = replyFoot(), f = text.endsWith(rf) ? rf : foot(); return l && text.endsWith(f) ? text.slice(0, -f.length) + l + '\n' + f : text; };
  const out = (kind: string, title: string, text: string, pdf: Message['pdf']): Item =>
    ({ ...base, kind, title, text: withPdf(text, pdf), pdf, pdfHref: pdf ? `/api/pdf/${S.project}/${pdf.kind}/${encodeURIComponent(pdf.id)}` : null,
      fine: kind === 'notice' || kind === 'reminder' ? { pct: feePct(), offer: fineOffer(o, d), added: o.feeDue || 0 } : null });
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
      '*Payment details*', `• Amount received: *${rs(p.amount)}*`, p.periodFrom ? `• Paid for: *${periodText(p.periodFrom, p.periodTo)}*${p.forWhat === 'electricity' ? ' (electricity)' : ''}` : null, `• Date: ${fd(p.d)}`, `• Receipt no: ${p.receipt}`, p.method ? `• Paid by: ${p.method}` : null, RULE,
      `*Remaining balance: ${after > 0 ? rs(after) : after < 0 ? `Rs 0 (advance credit ${rs(-after)})` : 'Rs 0, all paid up'}*`,
      l ? payBlock() : null, foot());
    return out('receipt', 'Payment received', text, { kind: 'receipt', id: p.id });
  }
  const b = (billId && S.bills.find(x => x.id === billId)) || f.bill;
  if (type === 'bill' && b && !b.months) {
    // An electricity (utility) bill (Phase 3): the readings, the amount and its own due date.
    const k = utilKind(b), lines0 = b.lines.filter(l => l.kind === 'utility');
    const text = lines(head(o, `⚡ ${k} bill · ${fm(b.period)}`, `Your ${k.toLowerCase()} bill for *${fm(b.period)}* is *${rs(b.net)}*, due by *${fd(b.dueDate)}*.`), details(o), '',
      `*${k} bill*`, ...lines0.map(l => `• ${l.label.replace(`${k}, `, '')}: ${rs(l.amount)}`), b.photoId ? '📷 _The photo of your bill is in the PDF below._' : null, RULE, bal > 0 ? `*Total to pay now: ${rs(bal)}*` : `*Paid from your advance credit${bal < 0 ? `; credit left ${rs(-bal)}` : ''}.*`,
      bal > 0 ? payBlock() : null, bal > 0 ? replyFoot() : foot());
    return { ...out('bill', `${k} bill · ${fm(b.period)}`, text, { kind: 'bill', id: b.id }), billPhoto: { billId: b.id, id: b.photoId || null, photos: PHOTOS_ON } };
  }
  if (type === 'reminder' && billId && b && isUtilBill(b)) {
    // An electricity bill reminder (21 Nov 2026): separate from the maintenance reminders; the balance shown is the
    // customer's whole balance (maintenance and electricity).
    const k = utilKind(b), left = Math.max(0, b.net - b.paid), all = elecDue(o);
    if (left <= 0) return null;
    const text = lines(head(o, `⏰ ${k} bill reminder · ${fm(b.period)}`, b.dueDate < d ? `Your ${k.toLowerCase()} bill for *${fm(b.period)}* was due on *${fd(b.dueDate)}* and is still unpaid.` : `A reminder that your ${k.toLowerCase()} bill for *${fm(b.period)}* is due on *${fd(b.dueDate)}*.`), details(o), '',
      `*${k} bill*`, `• ${fm(b.period)}: ${rs(b.net)}`, b.paid > 0 ? `• Paid so far: ${rs(b.paid)}` : null, `• *Still to pay: ${rs(left)}*`, all > left ? `• All ${k.toLowerCase()} bills unpaid: ${rs(all)}` : null, RULE,
      `*Your total balance (maintenance and ${k.toLowerCase()}): ${rs(Math.max(0, bal))}*`, payBlock(),
      '', '_If you have already paid, please show the payment to your building manager._', replyFoot());
    return { ...out('reminder', `${k} reminder · ${fm(b.period)}`, text, { kind: 'bill', id: b.id }), billPhoto: { billId: b.id, id: b.photoId || null, photos: PHOTOS_ON } };
  }
  if (type === 'bill' && b && bal <= 0) {
    const text = lines(head(o, `🧾 Maintenance bill · ${periodLabel(b)}`, `Your maintenance bill for *${periodLabel(b)}* has been paid from your advance credit. Nothing is due.`), details(o), '',
      '*Bill details*', `• ${periodLabel(b)}: ${rs(b.net)}`, RULE, `*Advance credit left: ${rs(-bal)}*`, foot());
    return out('bill', `Bill · ${periodLabel(b)}`, text, { kind: 'bill', id: b.id });
  }
  if (bal <= 0) return null;
  if (type === 'bill' && b) {
    const text = lines(head(o, `🧾 Maintenance bill · ${periodLabel(b)}`, `Your maintenance bill for *${periodLabel(b)}* is ready: *${rs(b.net)}*, due by *${fd(b.dueDate)}*.`),
      details(o), duesList(o, bal), payBlock(), replyFoot());
    return out('bill', `Bill · ${periodLabel(b)}`, text, { kind: 'bill', id: b.id });
  }
  if (type === 'reminder') {
    const due = f.bill ? fd(f.bill.dueDate) : fd(addDays(d, 7));
    const text = lines(head(o, '⏰ Payment reminder', `This is a friendly reminder that your maintenance is due on *${due}*.`), details(o), duesList(o, bal), payBlock(),
      '', '_If you have already paid, please ignore this message._', foot());
    return out('reminder', 'Reminder', text, { kind: 'statement', id: o.id });
  }
  if (type === 'notice') {
    // Late payment warning (15 days after the due date). Whether a fine is added is the building manager's choice at
    // send time ("Add fine" in Send on WhatsApp); once added it shows in the dues list.
    const nb = f.late || f.bill, by = addDays(d, 7);
    const text = lines(head(o, '⚠️ Late payment warning', nb ? `Your maintenance dues were due on *${fd(nb.dueDate)}* and are still unpaid.` : 'Your maintenance dues are overdue.'), details(o), duesList(o, bal), '',
      `❗ *Please pay by ${fd(by)}.* If the dues remain unpaid, maintenance services may be discontinued.`, payBlock(), replyFoot());
    return out('notice', 'Late payment warning', text, nb ? { kind: 'bill', id: nb.id } : { kind: 'statement', id: o.id });
  }
  const text = lines(head(o, '💳 Your dues', 'Here are your maintenance dues as of today.'), details(o), duesList(o, bal), payBlock(), foot());
  return out('link', 'Your dues', text, { kind: 'statement', id: o.id });
}

/** Messages the CRM prepared that are waiting to be sent by hand, grouped per owner: the newest dues message (bill,
 *  reminder, notice or dues message) replaces older ones; receipts and notices each stand alone. */
export function pendingGroups(filter?: (m: Message) => boolean) {
  const S = cur(), by = new Map<string, Message[]>();
  for (const m of S.messages) if (m.status === 'pending' && m.from === 'biz' && (!filter || filter(m))) {
    const k = isDues(m) ? `${m.ownerId}:${isElecMsg(m) ? 'elec' : 'dues'}` : m.id;
    by.set(k, [...(by.get(k) || []), m]);
  }
  return [...by.values()].map(list => {
    list.sort((a, b) => (a.d + a.t).localeCompare(b.d + b.t));
    return { msg: list[list.length - 1], older: list.slice(0, -1) };
  });
}
/** To do: the messages waiting to be sent by hand, in groups (bills, the reminders on the 3rd and 7th…). */
export const TODO_GROUPS: { key: string; label: string; hint: string; kinds: string[] }[] = [
  { key: 'receipt', label: 'Receipts to send', hint: 'Payments just received: send each customer their receipt (PDF) straight away', kinds: ['receipt'] },
  { key: 'bill', label: 'Monthly bills', hint: 'First alert: the bill made on the customer\'s billing date', kinds: ['bill'] },
  { key: 'reminder', label: 'Reminders', hint: 'Unpaid bills, on the 3rd and 7th of the due month', kinds: ['reminder'] },
  { key: 'notice', label: 'Late payment warnings', hint: 'Unpaid 15 days after the due date: add the fine if you decide to', kinds: ['notice'] },
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

/** Bills and reminders (maintenance and electricity) that can go in one message to a phone number shared by several
 *  flats (21 Nov 2026). Late warnings stay on their own (the fine is decided per flat when sending); so do receipts,
 *  notices and announcements. */
export const COMBINE_KINDS = ['bill', 'reminder', 'link'];
/** Several flats' messages on one phone number → one message, one chat (each flat with its amount and its own PDF). */
export function combineItems(parts: SendItem[]): SendItem {
  const S = cur(), owners = [...new Map(parts.map(p => [p.ownerId, ownerById(p.ownerId)])).values()].filter(Boolean);
  const names = [...new Set(owners.map(o => niceName(o.name)))];
  const total = owners.reduce((a, o) => a + Math.max(0, balance(o)), 0);
  // Per flat: each waiting bill or reminder with its own PDF link, then what that flat owes in all.
  const blocks = owners.map(o => {
    const mine = parts.filter(p => p.ownerId === o.id);
    return lines('', `🏢 *${o.apt}*${o.block ? ` · Block ${o.block}` : ''}${names.length > 1 ? ` · ${niceName(o.name)}` : ''}`,
      ...mine.map(p => {
        const b = p.pdf?.kind === 'bill' ? S.bills.find(x => x.id === p.pdf!.id) : null, link = pdfLine(p.pdf)?.split('\n').pop() || null;
        return lines(`• ${p.title}${b ? `: ${rs(b.net)}${b.dueDate ? `, due ${fd(b.dueDate)}` : ''}` : ''}`, link ? `  📄 ${link}` : null);
      }),
      `*Due for ${o.apt}: ${rs(Math.max(0, balance(o)))}*`);
  });
  const text = lines(`*Minawa Group · Maintenance*`, `_📋 Your ${owners.length} apartments on this number_`, '', `Dear ${names.join(' / ')},`,
    `Here are the bills and reminders for your apartments in ${S.proj.name}. Each bill (PDF) has its own link below.`, ...blocks, RULE,
    `*Total to pay for all ${owners.length}: ${rs(total)}*`, payBlock(), replyFoot());
  const first = parts[0], urgent = parts.find(p => p.kind === 'bill') || first;
  return { ...first, key: `combo:${first.to}:${parts.map(p => p.key).join('+')}`, apt: owners.map(o => o.apt).join(', '), name: names.join(' / '),
    kind: urgent.kind, title: `${owners.length} apartments: ${[...new Set(parts.map(p => p.title.split(' · ')[0]))].join(', ')}`, text,
    pdf: null, pdfHref: null, fromMsg: null, replaces: [], fine: null, billPhoto: null, parts };
}
/** Puts the combinable messages of flats sharing a phone number into one item each (the rest stay as they are). */
export function combineByPhone(items: SendItem[]): SendItem[] {
  const by = new Map<string, SendItem[]>();
  for (const it of items) if (COMBINE_KINDS.includes(it.kind) && it.to) by.set(it.to, [...(by.get(it.to) || []), it]);
  const done = new Set<string>(), out: SendItem[] = [];
  for (const it of items) {
    const g = COMBINE_KINDS.includes(it.kind) && it.to ? by.get(it.to)! : null;
    if (!g || new Set(g.map(x => x.ownerId)).size < 2) { out.push(it); continue; }
    if (done.has(it.to)) continue;
    done.add(it.to); out.push(combineItems(g));
  }
  return out;
}

/** One prepared message, written again with today's figures where it's about money owed. */
export function composeQueued(m: Message, d: string, t: string): Omit<SendItem, 'key' | 'fromMsg' | 'replaces'> | null {
  const S = cur(), o = ownerById(m.ownerId);
  if (!o) return null;
  if (isDues(m)) return compose(o, m.kind as 'bill' | 'reminder' | 'notice' | 'link', d, t, {}, m.kind === 'bill' || isElecMsg(m) ? m.pdf?.id : undefined);
  if (m.kind === 'bill') return compose(o, 'bill', d, t, {}, m.pdf?.id);   // a bill paid from credit
  if (m.kind === 'receipt') return { ...compose(o, 'receipt', d, t, {}, undefined, m.pdf?.id)!, kind: m.kind, title: m.title };
  // A maintenance notice: its title and text in the full layout, with this flat's details.
  const v = m.vars || {};
  const text = m.kind === 'alert' && v.title ? noticeText(o, v.title, v.text || '')
    : lines(head(o, m.title || 'Message', ''), details(o), '', m.text.trim(), foot());
  return { ownerId: o.id, apt: o.apt, name: o.name, phone: o.phone, to: intl(o.phone), kind: m.kind, title: m.title, text,
    pdf: m.pdf, pdfHref: m.pdf ? `/api/pdf/${S.project}/${m.pdf.kind}/${encodeURIComponent(m.pdf.id)}` : null };
}
