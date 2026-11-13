// After the engine has recorded messages and payment links: creates the Safepay link for each new payment link, and
// keeps the Send on WhatsApp list tidy. Messages are only ever sent by hand. Runs inside the store lock.
import type { State, Message, PayLink } from './types';
import { use, ownerById, duesBreakdown, breakdownNote, bdVars, balance, log, payLink, payStaleLink, activeLink, at } from './engine';
import { first, rs, nowPKT, addDays, waDigits } from './fmt';
import { getStore } from './store';
import { safepayConfigured, safepayMode, createQuickLink, getQuickLink } from './safepay';


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

/** After any change: makes the Safepay links new messages need, and drops dues messages still waiting to be sent by
 *  hand once the owner has paid. Nothing is sent automatically: messages wait in Send on WhatsApp. */
export async function dispatch(s: State) {
  const c = { links: 0, skipped: 0 };
  for (const l of s.links.filter(x => x.status === 'active' && !x.sp)) { if (await ensureSafepay(s, l)) c.links++; }
  for (const m of s.messages) {
    if (m.from !== 'biz') continue;
    if (m.status === 'queued') m.status = 'pending';   // from before sending was by hand only
    if (m.status === 'pending' && ['bill', 'reminder', 'notice', 'link'].includes(m.kind) && m.tpl !== 'credit') {
      const o = use(s, () => ownerById(m.ownerId));
      if (o && use(s, () => balance(o)) <= 0) { m.status = 'skipped'; m.error = 'Paid before it was sent, so not needed'; c.skipped++; }
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
