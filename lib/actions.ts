'use server';
// Everything staff can do. Each action checks who is signed in, changes the project inside the lock
// (lib/ops.mutate), lets the dispatcher send what was queued, then returns to the page with a message.
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Owner, State } from './types';
import { requireStaff, requireAdmin, roleName, staffName } from './session';
import { mutate, runDailyAll, load, staffLog } from './ops';
import { getStore } from './store';
import {
  ownerById, balance, recordPayment, createBill, sendBill, isBillingDay, cancelLinks, unitOf, log, at, nid, rateTypes,
  verifyProof, rejectProof, sendPaymentLink, setTargetOption, pushMsg, payLink, resyncFines, apartments, monthsToBill, billDateOf
} from './engine';
import { fd, rs, ord, waDigits } from './fmt';
import { blankOwner } from './seed';
import { submitTemplate } from './whatsapp';
import { use } from './engine';
import { billDoc } from './docdata';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const ownerPath = (pid: string, oid: string) => `/p/${pid}/apartments/${oid}`;
const go = (path: string, toast?: string, extra = ''): never => redirect(path + (path.includes('?') ? '&' : '?') + (toast ? 't=' + encodeURIComponent(toast) : '') + extra);
function needOwner(s: State, oid: string): Owner { const o = ownerById(oid); if (!o) throw new Error('Apartment not found'); return o; }

/* ---------- apartment ---------- */
export async function recordPaymentAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid');
  const amt = Math.round(+S(fdata, 'amt'));
  if (!(amt > 0)) go(ownerPath(pid, oid), 'Enter an amount');
  const p = await mutate(pid, staff, s => recordPayment(needOwner(s, oid), amt, S(fdata, 'method'), S(fdata, 'ref'), s.today, 'staff', at(15), staffName(staff)));
  redirect(`${ownerPath(pid, oid)}?doc=receipt:${p.id}&flash=staff`);
}
export async function promiseAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), d = S(fdata, 'd'), note = S(fdata, 'note');
  await mutate(pid, staff, s => { const o = needOwner(s, oid); o.promiseUntil = d; o.notes.push({ d: s.today, by: staffName(staff), text: `Promised to pay by ${fd(d)}.${note ? ' ' + note : ''}` }); log(s.today, at(15), 'job', `Promise to pay recorded for ${o.apt} until ${fd(d)}. Notices paused`, o.id); });
  go(ownerPath(pid, oid), 'Promise saved. Notices paused until ' + fd(d));
}
export async function noteAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), text = S(fdata, 'text');
  if (text) await mutate(pid, staff, s => { needOwner(s, oid).notes.push({ d: s.today, by: staffName(staff), text }); }, { send: false, what: s => `Note added to ${ownerById(oid)?.apt || 'an apartment'} by ${staffName(staff)}: ${text.slice(0, 140)}` });
  go(ownerPath(pid, oid) + '?tab=notes', 'Note saved');
}
export async function discountAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), k = S(fdata, 'kind'), v = Math.max(0, Math.round(+S(fdata, 'value') || 0));
  if (k === 'pct' && v > 100) go(ownerPath(pid, oid), 'A percentage discount can be at most 100');
  await mutate(pid, staff, s => {
    const o = needOwner(s, oid), t = at(15);
    if (k === 'none' || !v) { o.discount = null; log(s.today, t, 'admin', `Discount removed for ${o.apt} by ${staffName(staff)}`, o.id); }
    else { o.discount = { kind: k as 'pct' | 'fixed', value: v, until: S(fdata, 'until') || null }; log(s.today, t, 'admin', `Discount set for ${o.apt}: ${k === 'pct' ? v + '%' : rs(v)}${o.discount.until ? ' until ' + fd(o.discount.until) : ''} by ${staffName(staff)}`, o.id); }
  }, { send: false });
  go(ownerPath(pid, oid), 'Discount saved');
}
export async function clearanceAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid');
  const no = await mutate(pid, staff, s => {
    const o = needOwner(s, oid);
    if (balance(o) > 0) return null;
    let c = s.clearances.find(x => x.ownerId === o.id);
    if (!c) { c = { no: 'DC-' + s.today.slice(0, 4) + '-' + String(nid('dc')).padStart(3, '0'), ownerId: o.id, project: pid, d: s.today, by: staffName(staff) }; s.clearances.push(c); log(s.today, at(15), 'admin', `Dues Clearance certificate ${c.no} issued for ${o.apt}`, o.id); }
    return c.no;
  }, { send: false });
  if (!no) go(ownerPath(pid, oid), 'Dues are outstanding, so no certificate can be issued');
  redirect(`${ownerPath(pid, oid)}?doc=clearance:${no}`);
}
export async function transferAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), name = S(fdata, 'name'), phone = S(fdata, 'phone');
  if (!name || !phone) go(ownerPath(pid, oid), 'Enter the buyer\'s name and WhatsApp number');
  const nidOut = await mutate(pid, staff, s => {
    const o = needOwner(s, oid), t = at(15), d = S(fdata, 'd') || s.today;
    if (balance(o) > 0) throw new Error('Dues are outstanding; record the payment first.');
    o.status = 'closed'; o.closedOn = d; cancelLinks(o, s.today, t, 'account closed on transfer');
    let c = s.clearances.find(x => x.ownerId === o.id);
    if (!c) { c = { no: 'DC-' + s.today.slice(0, 4) + '-' + String(nid('dc')).padStart(3, '0'), ownerId: o.id, project: pid, d: s.today, by: staffName(staff) }; s.clearances.push(c); }
    const n = blankOwner({ id: 'O' + nid('o'), project: pid, unit: unitOf(o), apt: o.apt, block: o.block, type: o.type, name, phone, possession: d, prevOwnerId: o.id, rate: o.rate, generator: !!o.generator });
    s.owners.push(n);
    log(s.today, t, 'admin', `${o.apt} transferred: ${o.name}'s account closed (clearance ${c.no}); new account for ${name}, billed on the ${ord(+d.slice(8))}`, n.id);
    if (isBillingDay(n, s.today)) { const b = createBill(n, s.today); sendBill(n, b, s.today); }
    return n.id;
  });
  go(ownerPath(pid, nidOut), 'Transfer done. The buyer is billed from the transfer date.');
}
export async function disconnectAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), sv = S(fdata, 'service');
  await mutate(pid, staff, s => { const o = needOwner(s, oid); o.suspensions.push({ service: sv, from: s.today, to: null, by: staffName(staff) }); log(s.today, at(15), 'flag', `${sv} disconnection recorded for ${o.apt}`, o.id); }, { send: false });
  go(ownerPath(pid, oid), 'Disconnection recorded');
}
export async function restoreAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid');
  await mutate(pid, staff, s => { const o = needOwner(s, oid); o.suspensions.forEach(x => { if (!x.to) { x.to = s.today; log(s.today, at(15), 'admin', `${x.service} restored for ${o.apt}`, o.id); } }); }, { send: false });
  go(ownerPath(pid, oid), 'Restoration recorded');
}
export async function fixNumberAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), phone = S(fdata, 'phone');
  if (waDigits(phone).length < 10) go(ownerPath(pid, oid) + '?m=fix', 'That doesn\'t look like a full WhatsApp number. Include the country code, e.g. +92.');
  await mutate(pid, staff, s => {
    const o = needOwner(s, oid);
    o.phone = phone; o.invalidPhone = false; o.noPhone = false;
    o.notes.push({ d: s.today, by: staffName(staff), text: `WhatsApp number corrected to ${phone}.` });
    log(s.today, at(15), 'admin', `Number fixed for ${o.apt}; latest balance resent`, o.id);
    if (balance(o) > 0) sendPaymentLink(o, s.today, at(15));
  });
  go(ownerPath(pid, oid), 'Number saved and message resent');
}
export async function editOwnerAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid');
  await mutate(pid, staff, s => {
    const o = needOwner(s, oid), ch: string[] = [];
    const name = S(fdata, 'name'), phone = S(fdata, 'phone'), email = S(fdata, 'email'), pos = S(fdata, 'possession');
    if (name && name !== o.name) { ch.push(`name ${o.name} → ${name}`); o.name = name; }
    if (phone !== o.phone) { ch.push(`WhatsApp ${o.phone || 'none'} → ${phone || 'none'}`); o.phone = phone; o.noPhone = !phone; o.invalidPhone = !phone; }
    if (email !== o.email) o.email = email;
    if (pos && (pos !== o.possession || !o.possessionKnown)) { ch.push(`possession ${o.possessionKnown ? fd(o.possession) : 'not on file'} → ${fd(pos)}`); o.possession = pos; o.possessionKnown = true; }
    o.abroad = fdata.get('abroad') === 'on';
    const plan = S(fdata, 'plan') as Owner['plan'];
    if (plan && ['monthly', 'quarterly', 'annual'].includes(plan) && plan !== o.plan) { ch.push(`billing plan ${o.plan} → ${plan}`); o.plan = plan; }
    if (staff.role === 'admin') { const ex = fdata.get('exempt') === 'on'; if (ex !== o.exempt) { ch.push(ex ? 'now exempt' : 'no longer exempt'); o.exempt = ex; if (!ex) o.exemptWhy = null; } }
    if (ch.length) log(s.today, at(15), 'admin', `${o.apt} edited by ${staffName(staff)}: ${ch.join('; ')}`, o.id);
  }, { send: false });
  go(ownerPath(pid, oid), 'Saved');
}
export async function sendLinkAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid');
  const m = await mutate(pid, staff, s => sendPaymentLink(needOwner(s, oid), s.today, at(15)));
  const st = m ? (await load(pid, staff)).messages.find(x => x.id === m.id) : null;
  go(ownerPath(pid, oid), !m ? 'Nothing owed, so no link was sent' : st?.status === 'sent' ? 'Payment link sent on WhatsApp' : st?.status === 'failed' ? `Not sent: ${st.error}` : `Link created. WhatsApp: ${st?.error || st?.status}`);
}
export async function pickAction(fdata: FormData) {
  await requireStaff();
  redirect(ownerPath(S(fdata, 'pid'), S(fdata, 'oid')) + '?m=send');
}

/* ---------- to do ---------- */
export async function verifyAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), id = S(fdata, 'id'), amt = Math.round(+S(fdata, 'amt') || 0);
  const p = await mutate(pid, staff, s => { const pr = s.proofs.find(x => x.id === id); if (!pr || pr.status !== 'pending') return null; return verifyProof(pr, s.today, at(15), staffName(staff), amt); });
  if (!p) go(`/p/${pid}/todo`, 'Already handled');
  redirect(`/p/${pid}/todo?doc=receipt:${p!.id}&flash=proof`);
}
export async function rejectAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), id = S(fdata, 'id');
  await mutate(pid, staff, s => { const pr = s.proofs.find(x => x.id === id); if (pr && pr.status === 'pending') rejectProof(pr, s.today, at(15)); });
  go(`/p/${pid}/todo`, 'Owner told on WhatsApp');
}
export async function alertDoneAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), id = S(fdata, 'id');
  await mutate(pid, staff, s => { const a = s.alerts.find(x => x.id === id); if (a) a.done = true; return a; }, { send: false, what: (_s, a) => a ? `Alert for ${ownerById(a.ownerId)?.apt || 'an apartment'} marked done by ${staffName(staff)}: ${a.text.slice(0, 120)}` : null });
  go(`/p/${pid}/todo`);
}
export async function retryMessageAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), id = S(fdata, 'id'), back = S(fdata, 'back') || `/p/${pid}/messages`;
  const auto = await mutate(pid, staff, s => { const m = s.messages.find(x => x.id === id), a = s.settings.rules.autoSend; if (m && (m.status === 'failed' || m.status === 'skipped')) { m.status = a ? 'queued' : 'pending'; m.error = null; log(s.today, at(15), 'message', `Message ${m.id} to ${ownerById(m.ownerId)?.apt} ${a ? 'queued again' : 'put back in Send on WhatsApp'} by ${staffName(staff)}`, m.ownerId); } return a; });
  go(back, auto ? 'Sent again' : 'Added to Send on WhatsApp, ready to send by hand');
}

/* ---------- settings (admins) ---------- */
export async function targetOptionAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid');
  await mutate(pid, staff, () => { setTargetOption(S(fdata, 'key') as 'disc' | 'exempt', fdata.get('all') ? null : S(fdata, 'id'), !!fdata.get('on')); }, { send: false });
  revalidatePath(`/p/${pid}`, 'layout');
}
export async function ratesAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid'), from = S(fdata, 'from');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) go(`/p/${pid}/settings`, 'Pick the date the new rates start');
  await mutate(pid, staff, s => {
    const types = [...rateTypes(), ...S(fdata, 'newtype').split(',').map(x => x.trim()).filter(Boolean)];
    for (const ty of [...new Set(types)]) {
      const v = Math.round(+S(fdata, 'r:' + ty) || 0); if (!(v > 0)) continue;
      const r = s.rates.find(x => x.type === ty && x.from === from);
      if (r) r.amount = v; else s.rates.push({ id: `${pid}:${ty}:${from}`, project: pid, type: ty, from, amount: v });
    }
    log(s.today, at(15), 'admin', `Rates from ${fd(from)} saved by ${staffName(staff)}: ${s.rates.filter(r => r.from === from).map(r => r.type + ' ' + rs(r.amount)).join(', ')}`);
  }, { send: false });
  go(`/p/${pid}/settings`, 'Rates saved. Use a mass announcement to tell owners.');
}
export async function rulesAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid');
  const n = (k: string, lo: number, hi: number, def: number) => { const v = Math.round(+S(fdata, k)); return Number.isFinite(v) && v >= lo && v <= hi ? v : def; };
  await mutate(pid, staff, s => {
    const r = s.settings.rules;
    const remind = [...new Set(S(fdata, 'remindDays').split(/[,\s]+/).map(x => Math.round(+x)).filter(x => x > 0 && x < 60))].sort((x, y) => y - x);
    const utilities = [...new Set(S(fdata, 'utilities').split(',').map(x => x.trim()).filter(Boolean).map(x => x[0].toUpperCase() + x.slice(1)))];
    const next = { ...r, billDay: n('billDay', 1, 28, r.billDay), dueDays: n('dueDays', 1, 60, r.dueDays), remindDays: remind, flagDays: n('flagDays', 1, 120, r.flagDays), autoSend: fdata.get('autoSend') === 'on', utilities };
    next.remindDays = next.remindDays.filter(x => x < next.dueDays);
    s.settings.rules = next;
    log(s.today, at(15), 'admin', `Billing schedule changed by ${staffName(staff)}: bills on the ${ord(next.billDay)}, due ${next.dueDays} days later, reminders ${next.remindDays.length ? next.remindDays.join(' and ') + ' days before' : 'off'}, flag ${next.flagDays} days after the due date, utilities: ${next.utilities.join(', ') || 'none'}, automatic sending ${next.autoSend ? 'on' : 'off'}. New bills use them.`);
  }, { send: false });
  go(`/p/${pid}/settings`, 'Billing schedule saved. It applies to new bills.');
}
/** The fine % is the accountant's to set. Optionally re-works every late owner's fine now and sends them their updated dues. */
export async function fineAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), pct = Math.round(+S(fdata, 'feePct') * 10) / 10, apply = !!fdata.get('apply'), send = !!fdata.get('send'), arrears = !!fdata.get('fineArrears');
  if (!(pct >= 0 && pct <= 50)) go(`/p/${pid}/settings#fine`, 'The fine must be between 0% and 50%');
  const n = await mutate(pid, staff, s => {
    const was = s.settings.rules.feePct, wasA = s.settings.rules.fineArrears;
    s.settings.rules = { ...s.settings.rules, feePct: pct, fineArrears: arrears };
    log(s.today, at(15), 'fine', `Fine changed from ${was}% to ${pct}% by ${staffName(staff)}${wasA !== arrears ? (arrears ? '; old arrears are now fined too' : '; old arrears are no longer fined') : ''}${apply ? ', applied to current late owners' : ', for new overdue dues'}`);
    if (!apply) return 0;
    const changed = resyncFines(s.today, at(15), staffName(staff));
    if (send) changed.forEach(o => { if (balance(o) > 0) sendPaymentLink(o, s.today, at(15)); });
    return changed.length;
  }, { send });
  go(`/p/${pid}/settings`, apply ? `Fine set to ${pct}%. ${n} late owner${n === 1 ? '' : 's'} updated${send ? ' and sent their new dues' : ''}.` : `Fine set to ${pct}% for new overdue dues`);
}
export async function announceAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid'), aud = S(fdata, 'aud'), text = S(fdata, 'text');
  if (!text) go(`/p/${pid}/settings`, 'Write the message first');
  const res = await mutate(pid, staff, s => {
    const t = at(15), list = s.owners.filter(x => x.status === 'active' && (aud === 'all' || x.block === aud));
    let failed = 0;
    list.forEach(x => { const m = pushMsg(x, s.today, t, { kind: 'announcement', title: 'Announcement', text, tpl: 'announce', vars: { text }, manual: true }); if (m.status === 'failed') failed++; });
    log(s.today, t, 'message', `Announcement sent to ${list.length} owners (${aud === 'all' ? 'all blocks' : 'Block ' + aud})${failed ? `, ${failed} failed` : ''} by ${staffName(staff)}`);
    return { n: list.length, failed };
  });
  go(`/p/${pid}/settings`, `Sent to ${res.n} owners${res.failed ? `, ${res.failed} failed` : ''}`);
}
export async function templateAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid'), k = S(fdata, 'k'), v = String(fdata.get('text') || '').trim(), submit = !!fdata.get('submit');
  if (!v) go(`/p/${pid}/settings`, 'The template can\'t be empty');
  const s0 = await load(pid, staff), tp = s0.templates[k];
  if (!tp) go(`/p/${pid}/settings`, 'Unknown template');
  let msg = 'Saved';
  const next = { ...tp };
  if (submit) {
    const version = (+(tp.metaName.match(/_v(\d+)$/)?.[1] || 1)) + 1, name = tp.metaName.replace(/_v\d+$/, '') + '_v' + version;
    try {
      const { renderPdf } = await import('./pdf'); const b = s0.bills[0], pdf = b ? await renderPdf(use(s0, () => billDoc(b))) : null;
      await submitTemplate({ name, text: v, examples: EXAMPLES, pdfHeader: ['bill', 'notice', 'reminder', 'link', 'receipt', 'credit'].includes(k) ? pdf : null, payButtonUrl: ['bill', 'notice', 'reminder', 'link'].includes(k) ? process.env.APP_URL || null : null });
      Object.assign(next, { pending: v, status: 'pending', submittedOn: s0.today, pendingName: name });
      msg = 'Submitted to Meta. The current wording is used until Meta approves the new one.';
    } catch (e) { go(`/p/${pid}/settings`, `Not submitted: ${(e as Error).message}`); }
  } else {
    // Without submitting: record the wording that is already approved in WhatsApp Manager under this name.
    Object.assign(next, { text: v, pending: null, status: 'approved', metaName: S(fdata, 'metaName') || tp.metaName });
    msg = 'Template saved';
  }
  const store = await getStore();
  await store.withLock(async () => { const s = await load(pid, staff); s.templates[k] = next as typeof tp; await store.saveTemplates(s.templates); await store.appendLog([{ id: 'L' + Date.now(), project: pid, d: s.today, t: at(15), kind: 'admin', text: `${tp.label} template ${submit ? 'submitted to Meta' : 'saved'} by ${staffName(staff)}`, ownerId: null, staffId: staff.id, by: staffName(staff) }]); });
  go(`/p/${pid}/settings`, msg);
}
const EXAMPLES: Record<string, string> = { name: 'Hamza', apt: 'A-101', month: 'November 2026', amount: 'Rs 5,000', breakdown: 'Oct 2026 Rs 5,000 + Nov 2026 Rs 5,000', dues: 'Rs 10,000', fee: 'Rs 1,000', total: 'Rs 11,000', due: '19 Nov 2026', final: '3 Dec 2026', paid: 'Rs 5,000', date: '4 Nov 2026', balance: 'Rs 0', credit: 'Rs 2,500', text: 'Water supply to Block C will be off on 13 Nov, 10 am to 4 pm for tank cleaning.', project: 'Country Club Apartments', title: 'Water supply interruption' };
export async function runDailyAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid');
  const out = await runDailyAll(staff) as Record<string, { days: string[] }>;
  const days = Object.values(out)[0]?.days || [];
  go(`/p/${pid}/settings`, days.length ? `Daily run done for ${days.length} day${days.length === 1 ? '' : 's'}` : 'Already up to date for today');
}
export async function projectBankAction(fdata: FormData) {
  const staff = await requireAdmin();
  const pid = S(fdata, 'pid'), store = await getStore();
  const p = (await store.listProjects()).find(x => x.id === pid);
  if (p) { p.bank = S(fdata, 'bank'); await store.saveProject(p); await staffLog(staff, `Bank details for ${p.name} changed by ${staffName(staff)}`, { project: pid }); }
  go(`/p/${pid}/settings`, 'Bank details saved');
}

/* ---------- the owner paying (simulated checkout, when Safepay isn't connected) ---------- */
export async function simulatePayAction(fdata: FormData) {
  // Test checkout only: never available unless ALLOW_SIMULATED_PAYMENTS=true (local mode and staging).
  if (process.env.ALLOW_SIMULATED_PAYMENTS !== 'true') throw new Error('Simulated payments are off.');
  const pid = S(fdata, 'pid'), id = S(fdata, 'id');
  await mutate(pid, null, s => { const l = s.links.find(x => x.id === id); if (l && l.status === 'active') payLink(l, 'Card', s.today, at(15), 'simulated'); });
  redirect(`/pay/${id}?done=1`);
}

/* ---------- staff (admins) ---------- */
/* ---------- staff (admins) ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleLabel = (r: string) => r === 'admin' ? 'Admin' : 'Accountant';
async function authAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
}

/** Edit someone's name, email, role, access or password. Every change is in the activity log (never the password itself). */
export async function staffAction(fdata: FormData) {
  const me = await requireAdmin(), store = await getStore();
  const id = S(fdata, 'id'), list = await store.listStaff(), st = list.find(x => x.id === id), back = `/admin?edit=${encodeURIComponent(id)}`;
  if (!st) go('/admin', 'Not found');
  const name = S(fdata, 'name') || st!.name, email = S(fdata, 'email').toLowerCase() || st!.email, role = S(fdata, 'role') === 'admin' ? 'admin' : 'accountant',
    active = !!fdata.get('active'), password = String(fdata.get('password') ?? '');
  if (!EMAIL_RE.test(email)) go(back, 'Enter a valid email');
  if (list.some(x => x.id !== id && x.email.toLowerCase() === email)) go(back, 'Someone else already signs in with that email');
  if (password && password.length < 8) go(back, 'The new password needs at least 8 characters');
  if (st!.id === me.id && (role !== 'admin' || !active)) go(back, 'You can\'t remove your own admin access');
  if (st!.role === 'admin' && (role !== 'admin' || !active) && list.filter(x => x.role === 'admin' && x.active && x.id !== id).length === 0) go(back, 'Keep at least one admin who can sign in');
  const ch: string[] = [];
  if (name !== st!.name) ch.push(`name ${st!.name} → ${name}`);
  if (email !== st!.email) ch.push(`email ${st!.email} → ${email}`);
  if (role !== st!.role) ch.push(`role ${roleLabel(st!.role)} → ${roleLabel(role)}`);
  if (active !== st!.active) ch.push(active ? 'can sign in again' : 'sign-in turned off');
  if (password) ch.push('password changed');
  if (!ch.length) go('/admin', 'Nothing changed');
  if (store.kind === 'supabase' && (email !== st!.email || password)) {
    const { error } = await (await authAdmin()).updateUserById(id, { ...(email !== st!.email ? { email, email_confirm: true } : {}), ...(password ? { password } : {}) });
    if (error) go(back, `Couldn't update the login: ${error.message}`);
  } else if (password) go(back, 'Local mode has one shared password (LOCAL_PASSWORD). Connect Supabase to give each person their own.');
  await store.saveStaff({ ...st!, name, email, role, active });
  await staffLog(me, `${name}'s account changed by ${staffName(me)}: ${ch.join('; ')}`);
  go('/admin', `${name} updated${password ? '. Give them the new password' : ''}`);
}

/** Add someone: a Supabase login (email + first password, confirmed) and their staff row with the role. */
export async function inviteAction(fdata: FormData) {
  const me = await requireAdmin();
  const email = S(fdata, 'email').toLowerCase(), name = S(fdata, 'name'), role = S(fdata, 'role') === 'admin' ? 'admin' : 'accountant', password = String(fdata.get('password') ?? '');
  if (!email || !name || password.length < 8) go('/admin?add=1', 'Enter a name, an email and a password of at least 8 characters');
  if (!EMAIL_RE.test(email)) go('/admin?add=1', 'Enter a valid email');
  const store = await getStore(), list = await store.listStaff();
  if (list.some(x => x.email.toLowerCase() === email)) go('/admin', `${email} is already on the staff list. Use Edit to change their details.`);
  let id = 'local-' + Date.now();
  if (store.kind === 'supabase') {
    const auth = await authAdmin();
    const { data, error } = await auth.createUser({ email, password, email_confirm: true });
    if (error || !data.user) go('/admin?add=1', `Couldn't add: ${error?.message}`);
    id = data.user!.id;
  }
  await store.saveStaff({ id, email, name, role, active: true });
  await staffLog(me, `${name} (${email}) added as ${role === 'admin' ? 'an admin' : 'an accountant'} by ${staffName(me)}`);
  go('/admin', `${name} can now sign in as ${role === 'admin' ? 'an admin' : 'an accountant'}`);
}
