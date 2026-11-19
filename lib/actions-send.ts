'use server';
// Send on WhatsApp (by hand): prepare the messages for the chosen owners, then record each one the accountant sends.
import { revalidatePath } from 'next/cache';
import type { Owner, WaLog, Staff } from './types';
import { getStore } from './store';
import { intl } from './dispatch';
import { requireStaff, requireRole, staffName } from './session';
import { siteOrigin } from './doclink';
import { mutate, load } from './ops';
import { ownerById, balance, log, at, nid, FIX_WAIT, fixWaiting, addFine, removeFine } from './engine';
import { nowPKT, fd, rs, waDigits } from './fmt';
import { waTestNumber } from './whatsapp';
import { compose, composeQueued, cantSend, pendingGroups, toDoKinds, type SendItem, type SendType, setDocBase, setPhotosOn, combineByPhone } from './manual-send';
import { photoStore } from './images';
import { pickNumber, fmtNumber, freeAt } from './wa-numbers';
import { use } from './engine';

/* ---------- WhatsApp daily limit (20 Nov 2026) ---------- */
export interface ChatTake { ok: boolean; error?: string; from?: string; used?: number; limit?: number; nextFree?: string | null; repeat?: boolean; none?: boolean }
/** Before a chat opens: counts this customer on the person's sending number (free if already counted in the last 24
 *  hours), or refuses when the number has reached its daily limit. Checked here on the server, in one step in the
 *  database, so two people sharing a number can't go over. */
export async function takeChatAction(input: { pid: string; ownerId: string; from?: string | null }): Promise<ChatTake> {
  const staff = await requireStaff();
  const n = pickNumber(staff, input.from);
  if (!n) return { ok: false, none: true, error: 'You have no WhatsApp number in the CRM yet, so chats can\'t be opened. Ask the Admin to add your number in Staff & connections.' };
  try {
    const s = await load(input.pid, staff);
    const o = use(s, () => ownerById(input.ownerId));
    if (!o) return { ok: false, error: 'Customer not found.' };
    const to = intl(o.phone || '');
    if (!to) return { ok: false, error: `${o.apt} has no WhatsApp number.` };
    const r = await (await getStore()).waTake({ number: n.number, limit: n.limit, to, staffId: staff.id, staffName: staffName(staff), project: input.pid, ownerId: o.id });
    if (!r.ok) return { ok: false, from: n.number, used: r.used, limit: r.limit, nextFree: r.nextFree || null,
      error: `Daily limit reached for ${fmtNumber(n.number)}: ${r.used} of ${r.limit} customers in the last 24 hours.${r.nextFree ? ` The next one frees up at ${freeAt(r.nextFree)}.` : ''} Switch to another of your numbers or wait.` };
    return { ok: true, from: n.number, used: r.used, limit: r.limit, repeat: !!r.repeat };
  } catch (e) { console.error('wa_take', (e as Error).message); return { ok: false, error: 'Could not check the daily limit. Check the connection and try again.' }; }
}

const who = (o: Owner) => `Apt ${o.apt} · ${o.name} (${o.phone || 'no number'})`;
const owes = (o: Owner) => { const b = balance(o); return b > 0 ? `; balance ${rs(b)}` : b < 0 ? `; credit ${rs(-b)}` : '; paid up'; };

/** The confirmation row (whatsapp_log): who sent what to whom, when, and the owner's details at that moment. */
function waRow(staff: Staff, o: Owner, it: SendItem, answer: WaLog['answer'], via: WaLog['via'], messageId: string | null, d: string, t: string): WaLog {
  const test = waTestNumber();
  return { id: 'W' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), project: o.project, ownerId: o.id, apt: o.apt, ownerName: o.name, block: o.block || '',
    phone: o.phone || '', sentTo: test || intl(o.phone || ''), answer, via, messageId, kind: it.kind, title: it.title, text: it.text, amount: balance(o),
    staffId: staff.id, staffName: staffName(staff), staffRole: staff.role, d, t, at: new Date().toISOString(), test: !!test, fromNumber: it.from || null };
}
async function saveWa(row: WaLog | null) {
  if (!row) return;
  try { await (await getStore()).addWaLog(row); } catch (e) { console.error('whatsapp_log', (e as Error).message); }
}

const TYPES: SendType[] = ['queue', 'link', 'bill', 'reminder', 'notice', 'receipt', 'custom'];

export interface Prepared { items: SendItem[]; left: { apt: string; why: string }[]; test: string | null }

/** Writes the messages with today's figures. Nothing is sent. */
export async function prepareSendAction(input: { pid: string; type: SendType; ids: string[]; title?: string; text?: string; pay?: boolean; notice?: string; only?: string }): Promise<Prepared> {
  const staff = await requireRole('manager');
  setDocBase(await siteOrigin()); setPhotosOn(!!photoStore());
  const type = TYPES.includes(input.type) ? input.type : 'link';
  const ids = new Set((input.ids || []).map(String));
  if (type === 'custom' && !String(input.text || '').trim()) return { items: [], left: [], test: waTestNumber() || null };
  const out = await mutate(input.pid, staff, s => {
    const d = s.today, t = at(15), items: SendItem[] = [], left: Prepared['left'] = [];
    if (type === 'queue') {
      const nt = input.notice ? s.notices.find(n => n.id === input.notice) : null;
      // To do › one kind of message ("all bills", "all reminders"…): the owners whose latest waiting message is of that kind.
      const only = input.only && input.only !== 'all' ? toDoKinds(input.only) : null;
      const groups = pendingGroups(m => (!ids.size || ids.has(m.ownerId)) && (!nt || (m.kind === 'alert' && m.d === nt.d && m.t === nt.t)))
        .filter(g => !only || only.includes(g.msg.kind));
      // In order of urgency (so the most important go first when a number's daily limit runs out): receipts (people who
      // just paid), late warnings, bills by due date (nearest first), reminders and dues, then notices and announcements.
      const rank = (k: string) => k === 'receipt' ? 0 : k === 'notice' ? 1 : k === 'bill' ? 2 : k === 'reminder' || k === 'link' || k === 'statement' ? 3 : 4;
      const dueOf = (m: typeof groups[number]['msg']) => (m.pdf?.kind === 'bill' ? s.bills.find(b => b.id === m.pdf!.id)?.dueDate : '') || '9999';
      groups.sort((a, b) => rank(a.msg.kind) - rank(b.msg.kind) || dueOf(a.msg).localeCompare(dueOf(b.msg)));
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
    // Flats sharing one phone number (21 Nov 2026): their bills and reminders go as one message, in one chat.
    return { items: combineByPhone(items), left };
  });
  // "Being done by" (Phase 4): with two building managers on one building, an owner someone else is sending to right
  // now is left out for 10 minutes, so the same message never goes twice. The batch is held for this person meanwhile.
  const store = await getStore(), holder = `${staff.id}|${staffName(staff)}`;
  const ownersOf = (it: SendItem) => it.parts?.length ? [...new Set(it.parts.map(p => p.ownerId))] : [it.ownerId];
  const taken = await Promise.all(out.items.map(async it => { for (const oid of ownersOf(it)) { const x = await store.claim(`claim:${input.pid}:send:${oid}`, holder, 600).catch(() => null); if (x) return x; } return null; }));
  const items = out.items.filter((_, i) => !taken[i]), left = [...out.left];
  out.items.forEach((it, i) => { if (taken[i]) left.push({ apt: it.apt, why: `Being sent by ${taken[i]!.split('|')[1] || 'someone else'} right now` }); });
  return { items, left, test: waTestNumber() || null };
}
/** Lets go of the owners this person had open in Send on WhatsApp but didn't get to (Stop here). */
export async function releaseSendAction(input: { pid: string; ownerIds: string[] }) {
  const staff = await requireRole('manager'), store = await getStore(), holder = `${staff.id}|${staffName(staff)}`;
  await Promise.all((input.ownerIds || []).slice(0, 500).map(id => store.release(`claim:${input.pid}:send:${id}`, holder).catch(() => {})));
  return { ok: true };
}

/** The accountant has sent this message in WhatsApp: record it on the owner's history. */
export async function recordSentAction(input: { pid: string; item: SendItem; via?: 'prompt' | 'button' }): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireRole('manager');
  const test = waTestNumber();
  // One chat for several flats (21 Nov 2026): each flat's message is recorded as sent, with the text that went.
  const list = input.item.parts?.length ? input.item.parts.map(p => ({ ...p, text: input.item.text, from: input.item.from })) : [input.item];
  try {
    const rows = await mutate(input.pid, staff, s => list.map(it => {
      const o = ownerById(it.ownerId);
      if (!o) throw new Error('Owner not found');
      const t = nowPKT(), now = new Date().toISOString();
      let m = it.fromMsg ? s.messages.find(x => x.id === it.fromMsg && x.status === 'pending') : undefined;
      if (m) { m.text = it.text; }
      else {
        m = { id: 'M' + nid('msg'), ownerId: o.id, project: s.project, d: s.today, t, from: 'biz', kind: it.kind, title: it.title, text: it.text,
          tpl: null, vars: null, pdf: it.pdf, status: 'sent', waId: null, error: null, manual: true, shot: false, sentAt: null };
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
      return waRow(staff, o, it, 'sent', input.via || 'button', m.id, s.today, t);
    }), { send: false });
    for (const row of rows) await saveWa(row);
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Leaves a prepared message unsent for good (e.g. the owner was told in person). */
export async function dropPendingAction(input: { pid: string; ids: string[] }): Promise<{ ok: boolean }> {
  const staff = await requireRole('manager');
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
  const staff = await requireRole('manager');
  try {
    const list = input.item.parts?.length ? input.item.parts.map(p => ({ ...p, text: input.item.text })) : [input.item];
    const rows = await mutate(input.pid, staff, s => list.map(it => {
      const o = ownerById(it.ownerId);
      if (!o) return null;
      const t = nowPKT();
      log(s.today, t, 'whatsapp', `${staffName(staff)} opened the WhatsApp chat for ${who(o)} but did not send "${it.title}"${owes(o)}`, o.id);
      return waRow(staff, o, it, 'not_sent', 'prompt', null, s.today, t);
    }), { send: false });
    for (const row of rows) await saveWa(row);
    return { ok: true };
  } catch { return { ok: false }; }
}

/* ---------- To do: a message that didn't arrive (no number, or not on WhatsApp) ---------- */
export interface ResendResult { ok: boolean; error?: string; toast?: string; item?: SendItem; to?: string }

/** The latest balance, ready to send by hand (nothing is sent yet). Inside mutate. */
function resendItem(o: Owner, d: string, t: string, replacesOf: (o: Owner) => string[]): { item: SendItem; to: string } | null {
  if (balance(o) <= 0) return null;
  const it = compose(o, 'link', d, t, {});
  if (!it) return null;
  return { item: { ...it, key: `link:${o.id}`, fromMsg: null, replaces: replacesOf(o) }, to: waTestNumber() || intl(o.phone) };
}

/** Save the owner's fixed or new WhatsApp number. The message stays in To do and its WhatsApp chat is ready to open;
 *  it leaves To do only once the accountant confirms it was sent. */
export async function fixNumberSendAction(input: { pid: string; oid: string; phone: string }): Promise<ResendResult> {
  const staff = await requireRole('manager'), phone = String(input.phone || '').trim();
  setDocBase(await siteOrigin()); setPhotosOn(!!photoStore());
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
    return { ok: true, toast: 'Number saved. Send the message in WhatsApp, then come back here and confirm it was sent.', item: r.ready.item, to: r.ready.to };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** To do: open the chat again for an owner whose number was fixed but whose message wasn't sent yet. */
export async function resendFixedAction(input: { pid: string; oid: string }): Promise<ResendResult> {
  const staff = await requireRole('manager');
  setDocBase(await siteOrigin()); setPhotosOn(!!photoStore());
  try {
    const ready = await mutate(input.pid, staff, s => {
      const o = ownerById(input.oid);
      if (!o || o.status !== 'active' || o.invalidPhone) throw new Error('Add the WhatsApp number first');
      return resendItem(o, s.today, at(15), x => pendingDues(s, x));
    });
    if (!ready) return { ok: true, toast: 'Nothing is owed now, so there is nothing to send.' };
    return { ok: true, toast: 'Send the message in WhatsApp, then come back here and confirm it was sent.', item: ready.item, to: ready.to };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** Dues messages still waiting in Send on WhatsApp for this owner: the message sent now replaces them. */
function pendingDues(s: { messages: import('./types').Message[] }, o: Owner) {
  return s.messages.filter(m => m.ownerId === o.id && m.status === 'pending' && m.from === 'biz' && ['bill', 'reminder', 'notice', 'link'].includes(m.kind) && m.tpl !== 'credit').map(m => m.id);
}

/** "Add fine" / "Remove fine" in the send runner (Phase 2): the building manager decides on the fine when sending a
 *  late warning or a reminder. Returns the message written again with the new figures. */
export async function fineAction(input: { pid: string; item: SendItem; add: boolean }): Promise<{ ok: boolean; error?: string; text?: string; fine?: SendItem['fine'] }> {
  const staff = await requireRole('manager');
  setDocBase(await siteOrigin()); setPhotosOn(!!photoStore());
  try {
    return await mutate(input.pid, staff, s => {
      const o = ownerById(input.item.ownerId); if (!o) throw new Error('Owner not found');
      const t = nowPKT(), who = staffName(staff);
      const n = input.add ? addFine(o, s.today, t, who) : removeFine(o, s.today, t, who);
      if (input.add && !n) throw new Error('Nothing is late, so there is no fine to add');
      const it = compose(o, (input.item.kind === 'reminder' ? 'reminder' : 'notice'), s.today, t);
      return { ok: true, text: it?.text, fine: it?.fine };
    }, { send: false });
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/* ---------- Printed vouchers (20 Nov 2026) ---------- */
/** The building manager delivered these customers' printed vouchers by hand: the messages count as delivered (on paper). */
export async function deliveredVouchersAction(input: { pid: string; ids: string[] }): Promise<{ ok: boolean; n: number; error?: string }> {
  const staff = await requireRole('manager');
  try {
    const n = await mutate(input.pid, staff, s => {
      const now = new Date().toISOString(), t = nowPKT(), done = new Map<string, number>();
      for (const id of (input.ids || []).slice(0, 2000)) {
        const m = s.messages.find(x => x.id === id && x.status === 'failed'); if (!m) continue;
        // Older messages of the same kind for this customer go with it (one paper covers them).
        for (const x of s.messages) if (x.ownerId === m.ownerId && x.status === 'failed' && (x.id === m.id || (x.kind === m.kind && (x.pdf?.id || '') === (m.pdf?.id || '')))) {
          Object.assign(x, { status: 'sent', waId: 'print', sentAt: now, error: `Printed and delivered by hand by ${staffName(staff)} on ${fd(s.today)}` });
          done.set(x.ownerId, (done.get(x.ownerId) || 0) + 1);
        }
      }
      for (const [oid, k] of done) { const o = ownerById(oid); if (o) log(s.today, t, 'message', `${staffName(staff)} delivered ${k === 1 ? 'a printed voucher' : `${k} printed vouchers`} by hand to ${o.apt} (${o.noPhone ? 'no WhatsApp number' : 'number not on WhatsApp'})`, o.id); }
      return done.size;
    }, { send: false });
    revalidatePath(`/p/${input.pid}/send`);
    return { ok: true, n };
  } catch (e) { return { ok: false, n: 0, error: (e as Error).message }; }
}
