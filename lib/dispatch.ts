// After the engine has recorded messages and payment links, this sends them: it creates the Safepay link for each
// new payment link, makes the PDF, and sends the approved WhatsApp template. Runs inside the store lock.
import type { State, Message, PayLink } from './types';
import { use, ownerById, duesBreakdown, breakdownNote, bdVars, balance, log, payLink, payStaleLink, activeLink, at } from './engine';
import { first, rs, nowPKT, addDays, waDigits } from './fmt';
import { billDoc, receiptDoc, statementDoc, type DocData } from './docdata';
import { waConfigured, waTestNumber, waDailyCap, uploadPdf, sendTemplate, sendText, WaError } from './whatsapp';
import { getStore } from './store';
import { safepayConfigured, safepayMode, createQuickLink, getQuickLink } from './safepay';

const BUTTON = new Set(['bill', 'notice', 'reminder', 'link']);

/** Owner's number in international digits: 0300… becomes 92300…; +92 300 … becomes 92300…. */
export function intl(phone: string) {
  let d = waDigits(phone);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = '92' + d.slice(1);
  return d;
}

export async function ensureSafepay(s: State, l: PayLink) {
  if (l.sp || l.status !== 'active' || !safepayConfigured()) return l.sp;
  try {
    const o = use(s, () => ownerById(l.ownerId));
    const note = use(s, () => breakdownNote(o, duesBreakdown(o)));
    const sp = await createQuickLink(l.amount, l.id, note);
    l.sp = { id: sp.id, url: sp.url, tracker: sp.tracker, amount: l.amount }; l.spError = null;
    use(s, () => log(s.today, nowPKT(), 'link', `Safepay link ${sp.id} created for ${l.id} (${rs(l.amount)})`, l.ownerId));
  } catch (e) {
    l.spError = (e as Error).message;
    use(s, () => log(s.today, nowPKT(), 'alert', `Couldn't create the Safepay link for ${l.id}: ${l.spError}`, l.ownerId));
  }
  return l.sp;
}

function docFor(s: State, m: Message): DocData | null {
  if (!m.pdf) return null;
  return use(s, () => {
    if (m.pdf!.kind === 'bill') { const b = s.bills.find(x => x.id === m.pdf!.id); return b ? billDoc(b) : null; }
    if (m.pdf!.kind === 'receipt') { const p = s.payments.find(x => x.id === m.pdf!.id); return p ? receiptDoc(p) : null; }
    const o = ownerById(m.ownerId), l = m.linkId ? s.links.find(x => x.id === m.linkId) : null;
    return o ? statementDoc(o, l) : null;
  });
}

async function sendOne(s: State, m: Message) {
  const o = use(s, () => ownerById(m.ownerId));
  const to = waTestNumber() || intl(o.phone);
  if (!to || to.length < 10) throw new WaError('No WhatsApp number on file', 131026);
  if (!m.tpl) return sendText(to, m.text);                     // free text: only inside WhatsApp's 24-hour window
  const tpl = s.templates[m.tpl];
  if (!tpl) throw new WaError(`No template "${m.tpl}"`);
  let doc: { mediaId: string; filename: string } | null = null;
  const d = docFor(s, m);
  if (d) { const { renderPdf } = await import('./pdf'); doc = { mediaId: await uploadPdf(await renderPdf(d), d.filename), filename: d.filename }; }
  return sendTemplate({ to, name: tpl.metaName, vars: m.vars || {}, doc, buttonSuffix: BUTTON.has(m.tpl) && m.linkId ? m.linkId : null });
}

/** Sends every queued message in this project. Returns counts. */
export async function dispatch(s: State) {
  const c = { sent: 0, failed: 0, skipped: 0, links: 0, waiting: 0 };
  for (const l of s.links.filter(x => x.status === 'active' && !x.sp)) { if (await ensureSafepay(s, l)) c.links++; }
  // Sending by hand: a bill, reminder, notice or link still waiting to be sent is dropped once the owner has paid.
  for (const m of s.messages) if (m.status === 'pending' && m.from === 'biz' && ['bill', 'reminder', 'notice', 'link'].includes(m.kind) && m.tpl !== 'credit') {
    const o = use(s, () => ownerById(m.ownerId));
    if (o && use(s, () => balance(o)) <= 0) { m.status = 'skipped'; m.error = 'Paid before it was sent, so not needed'; c.skipped++; }
  }
  // Payment confirmations first, then everything else in the order it was queued.
  const rank = (m: Message) => m.tpl === 'receipt' ? 0 : 1;
  const queued = s.messages.filter(m => m.status === 'queued' && m.from === 'biz').map((m, i) => ({ m, i })).sort((a, b) => rank(a.m) - rank(b.m) || a.i - b.i).map(x => x.m);
  // WhatsApp's daily limit counts different people messaged in 24 hours, across all projects.
  const cap = waConfigured() ? waDailyCap() : 0, test = waTestNumber();
  const reached = cap && queued.length ? new Set(await (await getStore()).recentRecipients(new Date(Date.now() - 864e5).toISOString())) : null;
  for (const m of queued) {
    if (!waConfigured()) { m.status = 'skipped'; m.error = 'WhatsApp is not set up yet'; c.skipped++; continue; }
    const o0 = use(s, () => ownerById(m.ownerId));
    // A bill, reminder or notice that waited (daily limit) is dropped if the owner has paid in the meantime.
    if (o0 && m.tpl !== 'receipt' && m.kind !== 'receipt' && m.d < s.today && use(s, () => balance(o0)) <= 0) { m.status = 'skipped'; m.error = 'Paid before it went out, so not sent'; c.skipped++; continue; }
    const who = test ? 'test' : m.ownerId;
    if (reached && !reached.has(who) && reached.size >= cap) {
      m.error = `Waiting: WhatsApp's daily limit (${cap} people in 24 hours) is reached. It goes out automatically as soon as there is room.`; c.waiting++; continue;
    }
    try {
      m.waId = await sendOne(s, m); m.status = 'sent'; m.sentAt = new Date().toISOString(); c.sent++;
      // Testing: say so on the message, so the owner's history never suggests they received it.
      m.error = test ? `Test: sent to the test number +${test}, not to the owner` : null;
      reached?.add(who);
      // A receipt that leaves something owed is followed by the payment link for the rest.
      if (m.tpl === 'receipt' && m.linkId) {
        const o = use(s, () => ownerById(m.ownerId)), l = s.links.find(x => x.id === m.linkId && x.status === 'active');
        if (l) {
          const vars = use(s, () => ({ name: first(o.name), apt: o.apt, ...bdVars(duesBreakdown(o)), total: rs(balance(o)) }));
          const tpl = s.templates.link;
          await sendTemplate({ to: waTestNumber() || intl(o.phone), name: tpl.metaName, vars, doc: null, buttonSuffix: l.id }).catch(() => undefined);
        }
      }
    } catch (e) {
      const err = e as WaError;
      m.status = 'failed'; m.error = err.message; c.failed++;
      const o = use(s, () => ownerById(m.ownerId));
      if (err.code === 131026 && o) { o.invalidPhone = true; o.noPhone = !o.phone; }
      use(s, () => log(s.today, nowPKT(), 'alert', `WhatsApp ${m.title} to ${o?.apt} failed: ${err.message}`, m.ownerId));
    }
  }
  return c;
}

/** Safety net for missed webhooks: asks Safepay about open links (and links replaced in the last 30 days). */
export async function checkSafepay(s: State, report?: string[]) {
  if (!safepayConfigured()) return [];
  const since = addDays(s.today, -30), paid: string[] = [];
  const open = s.links.filter(l => l.sp && !l.spSettled && (l.status === 'active' || (l.status === 'cancelled' && (l.cancelledOn || '') >= since)));
  for (const l of open) {
    try {
      const sp = await getQuickLink(l.sp!.id);
      report?.push(`${l.id} (${rs(l.amount)}): ${sp.isPaid ? 'paid' : (sp.status || 'not paid').toLowerCase()}`);
      if (!sp.isPaid || l.spSettled) continue;
      l.sp!.tracker = sp.tracker || l.sp!.tracker;
      const p = use(s, () => l.status === 'active' ? payLink(l, 'Card', s.today, nowPKT(), safepayMode()) : payStaleLink(l, s.today, nowPKT(), safepayMode()));
      paid.push(p.id);
    } catch (e) { report?.push(`${l.id}: Safepay didn't answer (${(e as Error).message})`); /* try again next time */ }
  }
  return paid;
}

export { activeLink, at };
