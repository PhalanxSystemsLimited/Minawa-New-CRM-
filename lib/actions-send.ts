'use server';
// Send on WhatsApp (by hand): prepare the messages for the chosen owners, then record each one the accountant sends.
import { revalidatePath } from 'next/cache';
import type { Owner, WaLog, Staff } from './types';
import { getStore } from './store';
import { intl } from './dispatch';
import { requireStaff, staffName } from './session';
import { mutate } from './ops';
import { ownerById, balance, log, at, nid } from './engine';
import { nowPKT, fd, rs } from './fmt';
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
  return { ...out, test: waTestNumber() || null };
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
