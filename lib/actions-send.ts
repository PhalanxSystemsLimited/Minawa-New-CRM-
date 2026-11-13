'use server';
// Send on WhatsApp (by hand): prepare the messages for the chosen owners, then record each one the accountant sends.
import { revalidatePath } from 'next/cache';
import type { Owner, WaLog, Staff } from './types';
import { getStore } from './store';
import { intl } from './dispatch';
import { requireStaff, staffName } from './session';
import { mutate, load } from './ops';
import { safepayConfigured } from './safepay';
import { ownerById, balance, log, at, nid, FIX_WAIT, fixWaiting } from './engine';
import { nowPKT, fd, rs, waDigits } from './fmt';
import { waTestNumber } from './whatsapp';
import { compose, composeQueued, cantSend, pendingGroups, type SendItem, type SendType } from './manual-send';

const who = (o: Owner) => `Apt ${o.apt} · ${o.name} (${o.phone || 'no number'})`;
const owes = (o: Owner) => { const b = balance(o); return b > 0 ? `; balance ${rs(b)}` : b < 0 ? `; credit ${rs(-b)}` : '; paid up'; };

/** The confirmation row (whatsapp_log): who sent what to whom, when, and the owner's details at that moment. */
function waRow(staff: Staff, o: Owner, it: SendItem, answer: WaLog['answer'], via: WaLog['via'], messageId: string | null, d: string, t: string): WaLog {
  const test = waTestNumber();
  return { id: 'W' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), project: o.project, ownerId: o.id, apt: o.apt, ownerName: o.name, block: o.block || '',
    phone: o.phone || '', sentTo: test || intl(o.phone || ''), answer, via, messageId, kind: it.kind, title: it.title, text: it.text, amount: balance(o), linkId: it.linkId, payUrl: it.payUrl,
    staffId: staff.id, staffName: staffName(staff), staffRole: staff.role, d, t, at: new Date().toISOString(), test: !!test };
}
async function saveWa(row: WaLog | null) {
  if (!row) return;
  try { await (await getStore()).addWaLog(row); } catch (e) { console.error('whatsapp_log', (e as Error).message); }
}

const TYPES: SendType[] = ['queue', 'link', 'bill', 'reminder', 'notice', 'receipt', 'custom'];

export interface Prepared { items: SendItem[]; left: { apt: string; why: string }[]; test: string | null }

/** Writes the messages with today's figures and creates the payment links they need. Nothing is sent. */
export async function prepareSendAction(input: { pid: string; type: SendType; ids: string[]; title?: string; text?: string; pay?: boolean; notice?: string }): Promise<Prepared> {
  const staff = await requireStaff();
  const type = TYPES.includes(input.type) ? input.type : 'link';
  const ids = new Set((input.ids || []).map(String));
  if (type === 'custom' && !String(input.text || '').trim()) return { items: [], left: [], test: waTestNumber() || null };
  const out = await mutate(input.pid, staff, s => {
    const d = s.today, t = at(15), items: SendItem[] = [], left: Prepared['left'] = [];
    if (type === 'queue') {
      const nt = input.notice ? s.notices.find(n => n.id === input.notice) : null;
      const groups = pendingGroups(m => (!ids.size || ids.has(m.ownerId)) && (!nt || (m.kind === 'alert' && m.d === nt.d && m.t === nt.t)));
      // Receipts first (people who just paid), then by apartment order as the owners were listed.
      groups.sort((a, b) => +(b.msg.kind === 'receipt') - +(a.msg.kind === 'receipt'));
      for (const g of groups) {
        const o = ownerById(g.msg.ownerId);
        if (!o || o.invalidPhone) { left.push({ apt: o?.apt || g.msg.ownerId, why: o?.noPhone ? 'No WhatsApp number' : 'Number not on WhatsApp' }); continue; }
        const it = composeQueued(g.msg, d, t);
        if (!it) {   // e.g. a bill for someone who has since paid
          for (const m of [g.msg, ...g.older]) { m.status = 'skipped'; m.error = 'Paid before it was sent, so not needed'; }
          left.push({ apt: o.apt, why: 'Paid already' }); continue;
        }
        items.push({ ...it, key: g.msg.id, fromMsg: g.msg.id, replaces: g.older.map(m => m.id) });
      }
    } else {
      for (const id of ids) {
        const o = ownerById(id);
        if (!o || o.status !== 'active') continue;
        const why = cantSend(o, type);
        if (why) { left.push({ apt: o.apt, why }); continue; }
        const it = compose(o, type, d, t, { title: input.title, text: input.text, pay: !!input.pay && balance(o) > 0 });
        if (!it) { left.push({ apt: o.apt, why: 'Nothing to send' }); continue; }
        // A dues message replaces dues messages still waiting for this owner; a receipt replaces a waiting receipt.
        const replaces = s.messages.filter(m => m.ownerId === o.id && m.status === 'pending' && m.from === 'biz' &&
          (type === 'receipt' ? m.kind === 'receipt' : ['link', 'bill', 'reminder', 'notice'].includes(type) && ['bill', 'reminder', 'notice', 'link'].includes(m.kind) && m.tpl !== 'credit')).map(m => m.id);
        items.push({ ...it, key: `${type}:${o.id}`, fromMsg: null, replaces });
      }
    }
    return { items, left };
  });
  return { items: await safepayLinks(input.pid, staff, out.items), left: out.left, test: waTestNumber() || null };
}

/** The Pay Now link in each message: Safepay's own card payment page for that link (made when the message was
 *  prepared), so the owner goes straight to entering card details. Falls back to the CRM's /pay/… address if Safepay
 *  isn't set up or the link couldn't be made. */
async function safepayLinks(pid: string, staff: Staff, items: SendItem[]): Promise<SendItem[]> {
  if (!safepayConfigured() || !items.some(i => i.linkId && i.payUrl)) return items;
  const s = await load(pid, staff);
  return items.map(it => {
    const url = it.linkId ? s.links.find(l => l.id === it.linkId && l.status === 'active')?.sp?.url : null;
    return url && it.payUrl && url !== it.payUrl ? { ...it, text: it.text.split(it.payUrl).join(url), payUrl: url } : it;
  });
}

/** The accountant has sent this message in WhatsApp: record it on the owner's history. */
export async function recordSentAction(input: { pid: string; item: SendItem; via?: 'prompt' | 'button' }): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireStaff();
  const it = input.item, test = waTestNumber();
  try {
    const row = await mutate(input.pid, staff, s => {
      const o = ownerById(it.ownerId);
      if (!o) throw new Error('Owner not found');
      const t = nowPKT(), now = new Date().toISOString();
      let m = it.fromMsg ? s.messages.find(x => x.id === it.fromMsg && x.status === 'pending') : undefined;
      if (m) { m.text = it.text; m.linkId = it.linkId; }
      else {
        m = { id: 'M' + nid('msg'), ownerId: o.id, project: s.project, d: s.today, t, from: 'biz', kind: it.kind, title: it.title, text: it.text,
          tpl: null, vars: null, linkId: it.linkId, pdf: it.pdf, status: 'sent', waId: null, error: null, manual: true, shot: false, sentAt: null };
        s.messages.push(m);
      }
      Object.assign(m, { status: 'sent', manual: true, sentAt: now, waId: 'hand', error: test ? `Test: opened with the test number +${test}, not the owner` : null });
      for (const id of it.replaces) {
        const x = s.messages.find(y => y.id === id && y.status === 'pending');
        if (x) { x.status = 'skipped'; x.error = `Replaced by the message sent by hand on ${fd(s.today)}`; }
      }
      // A message that didn't arrive because of the number is done with once something reaches the fixed number.
      for (const x of s.messages) if (x.ownerId === o.id && fixWaiting(x)) x.error = `Number fixed; sent by hand to the new number on ${fd(s.today)}`;
      // Staff activity (the admin sees it): who sent what to which owner, with the owner's details.
      log(s.today, t, 'whatsapp', `${staffName(staff)} sent "${it.title}" on WhatsApp to ${who(o)}${owes(o)}${input.via === 'prompt' ? '. Confirmed on returning to the CRM' : ''}${test ? ` (testing: went to +${test})` : ''}`, o.id);
      return waRow(staff, o, { ...it, linkId: m.linkId }, 'sent', input.via || 'button', m.id, s.today, t);
    }, { send: false });
    await saveWa(row);
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Leaves a prepared message unsent for good (e.g. the owner was told in person). */
export async function dropPendingAction(input: { pid: string; ids: string[] }): Promise<{ ok: boolean }> {
  const staff = await requireStaff();
  await mutate(input.pid, staff, s => {
    let n = 0;
    for (const id of input.ids) { const m = s.messages.find(x => x.id === id && x.status === 'pending'); if (m) { m.status = 'skipped'; m.error = `Not sent: set aside by ${staffName(staff)}`; n++; } }
    if (n) log(s.today, at(15), 'message', `${n} prepared message${n === 1 ? '' : 's'} set aside (not sent) by ${staffName(staff)}`);
  }, { send: false });
  revalidatePath(`/p/${input.pid}/send`);
  return { ok: true };
}

/** The accountant opened the chat but says the message was not sent: kept in staff activity, nothing recorded as sent. */
export async function recordNotSentAction(input: { pid: string; item: SendItem }): Promise<{ ok: boolean }> {
  const staff = await requireStaff();
  try {
    const row = await mutate(input.pid, staff, s => {
      const o = ownerById(input.item.ownerId);
      if (!o) return null;
      const t = nowPKT();
      log(s.today, t, 'whatsapp', `${staffName(staff)} opened the WhatsApp chat for ${who(o)} but did not send "${input.item.title}"${owes(o)}`, o.id);
      return waRow(staff, o, input.item, 'not_sent', 'prompt', null, s.today, t);
    }, { send: false });
    await saveWa(row);
    return { ok: true };
  } catch { return { ok: false }; }
}

/* ---------- To do: a message that didn't arrive (no number, or not on WhatsApp) ---------- */
export interface ResendResult { ok: boolean; error?: string; toast?: string; item?: SendItem; to?: string }

/** The latest balance with a fresh payment link, ready to send by hand (nothing is sent yet). Inside mutate. */
function resendItem(o: Owner, d: string, t: string, replacesOf: (o: Owner) => string[]): { item: SendItem; to: string } | null {
  if (balance(o) <= 0) return null;
  const it = compose(o, 'link', d, t, {});
  if (!it) return null;
  return { item: { ...it, key: `link:${o.id}`, fromMsg: null, replaces: replacesOf(o) }, to: waTestNumber() || intl(o.phone) };
}

/** Save the owner's fixed or new WhatsApp number. The message stays in To do and its WhatsApp chat is ready to open;
 *  it leaves To do only once the accountant confirms it was sent. */
export async function fixNumberSendAction(input: { pid: string; oid: string; phone: string }): Promise<ResendResult> {
  const staff = await requireStaff(), phone = String(input.phone || '').trim();
  if (waDigits(phone).length < 10) return { ok: false, error: 'That doesn\'t look like a full WhatsApp number. Include the country code, e.g. +92.' };
  try {
    const r = await mutate(input.pid, staff, s => {
      const o = ownerById(input.oid);
      if (!o || o.status !== 'active') throw new Error('Apartment not found');
      const was = o.noPhone ? 'none' : o.phone, t = at(15);
      o.phone = phone; o.invalidPhone = false; o.noPhone = false;
      o.notes.push({ d: s.today, by: staffName(staff), text: `WhatsApp number ${was === 'none' ? 'added' : 'corrected'}: ${phone}.` });
      const ready = resendItem(o, s.today, t, x => pendingDues(s, x));
      // Until it is sent, the message stays in To do.
      if (ready) for (const m of s.messages) if (m.ownerId === o.id && m.status === 'failed') m.error = FIX_WAIT + phone;
      log(s.today, t, 'admin', `Number fixed for ${o.apt} by ${staffName(staff)} (${was} → ${phone})${ready ? '; WhatsApp chat opened to send the latest balance' : '; nothing owed, so nothing to resend'}`, o.id);
      return { ready };
    }, { send: true });
    if (!r.ready) return { ok: true, toast: 'Number saved. Nothing is owed, so there is nothing to resend.' };
    const [item] = await safepayLinks(input.pid, staff, [r.ready.item]);
    return { ok: true, toast: 'Number saved. Send the message in WhatsApp, then come back here and confirm it was sent.', item, to: r.ready.to };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** To do: open the chat again for an owner whose number was fixed but whose message wasn't sent yet. */
export async function resendFixedAction(input: { pid: string; oid: string }): Promise<ResendResult> {
  const staff = await requireStaff();
  try {
    const ready = await mutate(input.pid, staff, s => {
      const o = ownerById(input.oid);
      if (!o || o.status !== 'active' || o.invalidPhone) throw new Error('Add the WhatsApp number first');
      return resendItem(o, s.today, at(15), x => pendingDues(s, x));
    });
    if (!ready) return { ok: true, toast: 'Nothing is owed now, so there is nothing to send.' };
    const [item] = await safepayLinks(input.pid, staff, [ready.item]);
    return { ok: true, toast: 'Send the message in WhatsApp, then come back here and confirm it was sent.', item, to: ready.to };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Dues messages still waiting in Send on WhatsApp for this owner: the message sent now replaces them. */
function pendingDues(s: { messages: import('./types').Message[] }, o: Owner) {
  return s.messages.filter(m => m.ownerId === o.id && m.status === 'pending' && m.from === 'biz' && ['bill', 'reminder', 'notice', 'link'].includes(m.kind) && m.tpl !== 'credit').map(m => m.id);
}
