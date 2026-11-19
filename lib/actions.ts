'use server';
// Everything staff can do. Each action checks who is signed in, changes the project inside the lock
// (lib/ops.mutate), lets the dispatcher send what was queued, then returns to the page with a message.
import { bankJoin } from './bank';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Owner, State, Staff, WaNumber } from './types';
import { parseNumbers, fmtNumber, normNumber, validNumber, MAX_LIMIT } from './wa-numbers';
import { requireStaff, requireRole, requireAdmin, roleName, staffName } from './session';
import { mutate, load, staffLog } from './ops';
import { getStore } from './store';
import {
  ownerById, balance, recordPayment, createBill, sendBill, isBillingDay, unitOf, log, at, nid, rateTypes,
  verifyProof, rejectProof, sendDues, setTargetOption, pushMsg, resyncFines, apartments, monthsToBill, billDateOf, recordCash, officeCash } from './engine';
import { fd, rs, ord, waDigits, todayPKT } from './fmt';
import { blankOwner } from './seed';
import { use } from './engine';
import { changeOrRequest, type ChangeResult } from './approvals';
import { billDoc } from './docdata';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const ownerPath = (pid: string, oid: string) => `/p/${pid}/apartments/${oid}`;
const go = (path: string, toast?: string, extra = ''): never => redirect(path + (path.includes('?') ? '&' : '?') + (toast ? 't=' + encodeURIComponent(toast) : '') + extra);
/** Runs a change; a rule it breaks (e.g. a missing reason) comes back as a message instead of an error page. */
async function attempt<T>(fn: () => Promise<T>): Promise<T | { error: string }> { try { return await fn(); } catch (e) { return { error: (e as Error).message }; } }
const failed = (x: unknown): x is { error: string } => !!x && typeof x === 'object' && 'error' in x;
function needOwner(s: State, oid: string): Owner { const o = ownerById(oid); if (!o) throw new Error('Apartment not found'); return o; }

/* ---------- apartment ---------- */
export async function recordPaymentAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid');
  const amt = Math.round(+S(fdata, 'amt'));
  if (!(amt > 0)) go(ownerPath(pid, oid), 'Enter an amount');
  // Payments are entered by building managers and accountants only (no online payments).
  if (staff.role === 'admin') go(ownerPath(pid, oid), 'Payments are entered by the building manager or the Accountant');
  // A building manager enters a payment (cash or bank transfer): since 19 Nov 2026 it counts at once (balance, receipt)
  // and he goes straight to sending the receipt; the Accountant then confirms he received the money.
  if (staff.role === 'manager') {
    const paidOn = /^\d{4}-\d{2}-\d{2}$/.test(S(fdata, 'paidOn')) ? S(fdata, 'paidOn') : todayPKT();
    const method = S(fdata, 'method') === 'Bank transfer' ? 'Bank transfer' : 'Cash', txn = S(fdata, 'txn').slice(0, 80);
    if (method === 'Cash' && !S(fdata, 'ref')) go(ownerPath(pid, oid) + '?m=recpay', 'Enter the receipt number you gave the owner');
    if (method === 'Bank transfer' && !txn) go(ownerPath(pid, oid) + '?m=recpay-bank', 'Enter the bank transaction ID');
    await mutate(pid, staff, s => recordCash(needOwner(s, oid), amt, paidOn, S(fdata, 'ref'), S(fdata, 'note'), s.today, at(15), staff.id, staffName(staff), method, txn, S(fdata, 'forWhat') === 'electricity' ? 'electricity' : null), { send: false });
    go(`/p/${pid}/send?type=queue&kind=receipt&ids=${encodeURIComponent(oid)}&go=1`, `${method === 'Cash' ? 'Cash' : 'Bank transfer'} of Rs ${amt.toLocaleString('en-US')} entered. Send the receipt now.`);
  }
  if (!S(fdata, 'ref')) go(ownerPath(pid, oid) + '?m=recpay', 'Enter the receipt number you gave the owner');
  const p = await mutate(pid, staff, s => officeCash(needOwner(s, oid), amt, S(fdata, 'ref'), s.today, at(15), staff.id, staffName(staff)));
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
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), k = S(fdata, 'kind'), v = Math.max(0, Math.round(+S(fdata, 'value') || 0));
  if (k === 'pct' && v > 100) go(ownerPath(pid, oid), 'A percentage discount can be at most 100');
  // An admin's discount applies now; an accountant's waits for an admin's approval.
  const r = await attempt(() => mutate(pid, staff, s => changeOrRequest(needOwner(s, oid), 'discount', { kind: k === 'none' || !v ? 'none' : k, value: v, until: S(fdata, 'until') || null, apply: S(fdata, 'apply') === 'current' ? 'current' : 'next' }, S(fdata, 'why')), { send: false }));
  if (failed(r)) go(ownerPath(pid, oid) + '?m=discount', r.error);
  go(ownerPath(pid, oid), (r as ChangeResult).text);
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
    o.status = 'closed'; o.closedOn = d;
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
    if (balance(o) > 0) sendDues(o, s.today, at(15));
  });
  go(ownerPath(pid, oid), 'Number saved and message resent');
}
export async function editOwnerAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid');
  const asked = await attempt(() => mutate(pid, staff, s => {
    const o = needOwner(s, oid), ch: string[] = [];
    const name = S(fdata, 'name'), phone = S(fdata, 'phone'), email = S(fdata, 'email'), pos = S(fdata, 'possession');
    if (name && name !== o.name) { ch.push(`name ${o.name} → ${name}`); o.name = name; }
    if (phone !== o.phone) { ch.push(`WhatsApp ${o.phone || 'none'} → ${phone || 'none'}`); o.phone = phone; o.noPhone = !phone; o.invalidPhone = !phone; }
    if (email !== o.email) o.email = email;
    o.abroad = fdata.get('abroad') === 'on';
    if (staff.role === 'admin') { const ex = fdata.get('exempt') === 'on'; if (ex !== o.exempt) { ch.push(ex ? 'now exempt' : 'no longer exempt'); o.exempt = ex; if (!ex) o.exemptWhy = null; } }
    if (ch.length) log(s.today, at(15), 'admin', `${o.apt} edited by ${staffName(staff)}: ${ch.join('; ')}`, o.id);
    // What the flat is charged (billing plan, own monthly fee): an accountant's change waits for an admin's approval.
    const out: ChangeResult[] = [], why = S(fdata, 'why');
    const plan = S(fdata, 'plan');
    if (pos && (pos !== o.possession || !o.possessionKnown)) out.push(changeOrRequest(o, 'posdate', { possession: pos }, why));
    if (plan && ['monthly', 'quarterly', 'sixmonthly', 'annual'].includes(plan)) out.push(changeOrRequest(o, 'plan', { plan }, why));
    if (fdata.has('ownRate')) { const r = Math.max(0, Math.round(+S(fdata, 'ownRate').replace(/[,\s]/g, '') || 0)); out.push(changeOrRequest(o, 'rate', { rate: r || null, apply: S(fdata, 'apply') === 'current' ? 'current' : 'next' }, why)); }
    return out.filter(x => x.done === 'requested').map(x => x.summary);
  }, { send: false }));
  if (failed(asked)) go(ownerPath(pid, oid) + '?m=edit', `Not saved: ${asked.error}`);
  const list = asked as string[];
  go(ownerPath(pid, oid), list.length ? `Saved. Sent to an admin for approval: ${list.join('; ')}. It applies once approved.` : 'Saved');
}
export async function pickAction(fdata: FormData) {
  await requireRole('manager');
  redirect(ownerPath(S(fdata, 'pid'), S(fdata, 'oid')) + '?m=send');
}

/* ---------- to do ---------- */
export async function verifyAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), id = S(fdata, 'id'), amt = Math.round(+S(fdata, 'amt') || 0), back = S(fdata, 'back');
  if (staff.role === 'manager') go(back || `/p/${pid}/todo`, 'Payments are confirmed by the Accountant');
  const p = await mutate(pid, staff, s => { const pr = s.proofs.find(x => x.id === id); if (!pr || pr.status !== 'pending') return null; return verifyProof(pr, s.today, at(15), staffName(staff), amt); });
  if (!p) go(back || `/p/${pid}/todo`, 'Already handled');
  if (back) go(back, `Payment recorded: receipt ${p!.receipt}`);
  redirect(`/p/${pid}/todo?doc=receipt:${p!.id}&flash=proof`);
}
export async function rejectAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), id = S(fdata, 'id'), back = S(fdata, 'back');
  if (staff.role === 'manager') go(back || `/p/${pid}/todo`, 'Payments are confirmed by the Accountant');
  const kind = await mutate(pid, staff, s => { const pr = s.proofs.find(x => x.id === id); if (!pr || pr.status !== 'pending') return null; rejectProof(pr, s.today, at(15), staffName(staff), S(fdata, 'reply')); return pr.kind || 'transfer'; });
  if (!kind) go(back || `/p/${pid}/todo`, 'Already handled');
  go(back || `/p/${pid}/todo`, kind === 'cash' ? 'Marked as not received. The building manager sees your note.' : 'Owner told on WhatsApp');
}
export async function alertDoneAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), id = S(fdata, 'id');
  await mutate(pid, staff, s => { const a = s.alerts.find(x => x.id === id); if (a) a.done = true; return a; }, { send: false, what: (_s, a) => a ? `Alert for ${ownerById(a.ownerId)?.apt || 'an apartment'} marked done by ${staffName(staff)}: ${a.text.slice(0, 120)}` : null });
  go(`/p/${pid}/todo`);
}
export async function retryMessageAction(fdata: FormData) {
  const staff = await requireRole('manager'), pid = S(fdata, 'pid'), id = S(fdata, 'id'), back = S(fdata, 'back') || `/p/${pid}/messages`;
  await mutate(pid, staff, s => { const m = s.messages.find(x => x.id === id); if (m && (m.status === 'failed' || m.status === 'skipped')) { m.status = 'pending'; m.error = null; log(s.today, at(15), 'message', `Message ${m.id} to ${ownerById(m.ownerId)?.apt} put back in Send on WhatsApp by ${staffName(staff)}`, m.ownerId); } });
  go(back, 'Added to Send on WhatsApp, ready to send by hand');
}

/* ---------- settings (admins) ---------- */
export async function targetOptionAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid');
  await mutate(pid, staff, () => { setTargetOption(S(fdata, 'key') as 'disc' | 'exempt', fdata.get('all') ? null : S(fdata, 'id'), !!fdata.get('on')); }, { send: false });
  revalidatePath(`/p/${pid}`, 'layout');
}
export async function ratesAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), from = S(fdata, 'from'), back = `/p/${pid}/settings`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) go(back, 'Pick the date the new rates start');
  // An admin's rates apply now; an accountant's wait for an admin's approval.
  const r = await attempt(() => mutate(pid, staff, () => {
    const rates: Record<string, number> = {};
    for (const ty of [...new Set([...rateTypes(), ...S(fdata, 'newtype').split(',').map(x => x.trim()).filter(Boolean)])]) { const v = Math.round(+S(fdata, 'r:' + ty) || 0); if (v > 0) rates[ty] = v; }
    return changeOrRequest(null, 'rates', { from, rates, apply: S(fdata, 'apply') === 'current' ? 'current' : 'next' }, S(fdata, 'why'));
  }, { send: false }));
  go(back, failed(r) ? r.error : r.done === 'applied' ? 'Rates saved. Use a mass announcement to tell owners.' : r.text);
}
export async function rulesAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), back = `/p/${pid}/settings`;
  const n = (k: string, lo: number, hi: number, def: number) => { const v = Math.round(+S(fdata, k)); return Number.isFinite(v) && v >= lo && v <= hi ? v : def; };
  const r = await attempt(() => mutate(pid, staff, s => {
    const r0 = s.settings.rules;
    const remindOn = [...new Set(S(fdata, 'remindOn').split(/[,\s]+/).map(x => Math.round(+x)).filter(x => x >= 1 && x <= 28))].sort((x, y) => x - y);
    const utilities = [...new Set(S(fdata, 'utilities').split(',').map(x => x.trim()).filter(Boolean).map(x => x[0].toUpperCase() + x.slice(1)))];
    const c = { billDay: r0.billDay, dueDays: r0.dueDays, remindOn: r0.remindOn, flagDays: r0.flagDays, utilities, graceDays: r0.graceDays, billLead: n('billLead', 1, 60, r0.billLead), warnAfter: n('warnAfter', 1, 60, r0.warnAfter) };
    void remindOn;
    return changeOrRequest(null, 'rules', c, S(fdata, 'why'));
  }, { send: false }));
  go(back, failed(r) ? r.error : r.text);
}
/** The fine %: optionally re-works every late owner's fine now and sends them their updated dues. An accountant's
 *  change waits for an admin's approval. */
export async function fineAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), pct = Math.round(+S(fdata, 'feePct') * 10) / 10, back = `/p/${pid}/settings`;
  if (!(pct >= 0 && pct <= 50)) go(back + '#fine', 'The fine must be between 0% and 50%');
  const c = { feePct: pct, fineArrears: !!fdata.get('fineArrears'), apply: !!fdata.get('apply'), send: !!fdata.get('send') };
  const r = await attempt(() => mutate(pid, staff, () => changeOrRequest(null, 'fine', c, S(fdata, 'why')), { send: c.send }));
  go(back, failed(r) ? r.error : r.text);
}
export async function announceAction(fdata: FormData) {
  const staff = await requireRole('manager'), pid = S(fdata, 'pid'), back = `/p/${pid}/send?mode=announce`;
  if (!S(fdata, 'text')) go(back, 'Write the message first');
  const r = await attempt(() => mutate(pid, staff, () => changeOrRequest(null, 'announce', { aud: S(fdata, 'aud') || 'all', text: S(fdata, 'text') }, S(fdata, 'why'))));
  go(back, failed(r) ? r.error : r.text);
}
export async function projectBankAction(fdata: FormData) {
  const staff = await requireAdmin();
  const pid = S(fdata, 'pid'), store = await getStore(), all = S(fdata, 'all') === '1';
  const b = { title: S(fdata, 'title'), bank: S(fdata, 'bank'), account: S(fdata, 'account') };
  const value = b.account ? bankJoin(b) : '';
  for (const p of await store.listProjects()) if (p.id === pid || (all && p.live)) {
    p.bank = value; await store.saveProject(p);
    await staffLog(staff, `Bank account for ${p.name} ${value ? `set to ${b.bank} A/C ${b.account}` : 'removed'} by ${staffName(staff)}`, { project: p.id });
  }
  go(`/p/${pid}/settings`, value ? `Bank account saved${all ? ' for every building' : ''}` : 'Bank account removed');
}

/* ---------- staff (admins) ---------- */
/* ---------- staff (admins) ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const roleLabel = (r: string) => r === 'admin' ? 'Admin' : r === 'manager' ? 'Building manager' : 'Accountant';
const roleOf = (v: string): Staff['role'] => v === 'admin' ? 'admin' : v === 'manager' ? 'manager' : 'accountant';
/** The buildings ticked on the staff form (only kept for Building managers). */
const buildingsOf = (f: FormData, role: string) => role === 'manager' || role === 'accountant' ? f.getAll('projects').map(String).filter(Boolean) : [];
async function authAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;
}

/** Ends every Supabase sign-in session of a staff member (migration 0015's end_user_sessions; service role only). */
async function endSessions(id: string) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.rpc('end_user_sessions', { p_user: id });
    if (error) { console.error('end sessions', error.message); return false; }
    return true;
  } catch (e) { console.error('end sessions', (e as Error).message); return false; }
}

/** Edit someone's name, email, role, access or password. Every change is in the activity log (never the password itself). */
export async function staffAction(fdata: FormData) {
  const me = await requireAdmin(), store = await getStore();
  const id = S(fdata, 'id'), list = await store.listStaff(), st = list.find(x => x.id === id), back = `/admin?edit=${encodeURIComponent(id)}`;
  if (!st) go('/admin', 'Not found');
  const name = S(fdata, 'name') || st!.name, email = S(fdata, 'email').toLowerCase() || st!.email, role = roleOf(S(fdata, 'role')), projects = buildingsOf(fdata, role),
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
  if (role !== 'admin' && [...(st!.projects || [])].sort().join(',') !== [...projects].sort().join(',')) ch.push(`buildings: ${projects.join(', ')}`);
  if ((role === 'manager' || role === 'accountant') && !projects.length) go(back, 'Please select at least one building for this role before saving.');
  if (active !== st!.active) ch.push(active ? 'can sign in again' : 'sign-in turned off');
  if (password) ch.push('password changed');
  // WhatsApp numbers this person sends from (20 Nov 2026): checked, and every change logged.
  let waNumbers: WaNumber[] = [], bad = '';
  try { waNumbers = parseNumbers(S(fdata, 'waNumbers'), st!.waNumbers || []); } catch (e) { bad = (e as Error).message; }
  if (bad) go(back, bad);
  if (numsText(st!.waNumbers || []) !== numsText(waNumbers)) ch.push(`WhatsApp numbers: ${numsText(waNumbers) || 'none'}`);
  if (!ch.length) go('/admin', 'Nothing changed');
  if (store.kind === 'supabase' && (email !== st!.email || password)) {
    const { error } = await (await authAdmin()).updateUserById(id, { ...(email !== st!.email ? { email, email_confirm: true } : {}), ...(password ? { password } : {}) });
    if (error) go(back, `Couldn't update the login: ${error.message}`);
  } else if (password) go(back, 'Local mode has one shared password (LOCAL_PASSWORD). Connect Supabase to give each person their own.');
  await store.saveStaff({ ...st!, name, email, role, active, projects, waNumbers });
  // A new password or login, or sign-in turned off: sign them out on every device at once (18 Nov 2026).
  let ended = false;
  if (store.kind === 'supabase' && (password || email !== st!.email || (!active && st!.active)) && st!.id !== me.id) ended = await endSessions(st!.id);
  await staffLog(me, `${name}'s account changed by ${staffName(me)}: ${ch.join('; ')}${ended ? ' (signed out on every device)' : ''}`);
  go('/admin', `${name} updated${password ? '. Give them the new password' : ''}`);
}

/** Add someone: a Supabase login (email + first password, confirmed) and their staff row with the role. */
export async function inviteAction(fdata: FormData) {
  const me = await requireAdmin();
  const email = S(fdata, 'email').toLowerCase(), name = S(fdata, 'name'), role = roleOf(S(fdata, 'role')), projects = buildingsOf(fdata, role), password = String(fdata.get('password') ?? '');
  if (!email || !name || password.length < 8) go('/admin?add=1', 'Enter a name, an email and a password of at least 8 characters');
  if ((role === 'manager' || role === 'accountant') && !projects.length) go('/admin?add=1', 'Please select at least one building for this role before creating the account.');
  if (!EMAIL_RE.test(email)) go('/admin?add=1', 'Enter a valid email');
  let waNumbers: WaNumber[] = [], bad = '';
  try { waNumbers = parseNumbers(S(fdata, 'waNumbers')); } catch (e) { bad = (e as Error).message; }
  if (bad) go('/admin?add=1', bad);
  const store = await getStore(), list = await store.listStaff();
  if (list.some(x => x.email.toLowerCase() === email)) go('/admin', `${email} is already on the staff list. Use Edit to change their details.`);
  let id = 'local-' + Date.now();
  if (store.kind === 'supabase') {
    const auth = await authAdmin();
    const { data, error } = await auth.createUser({ email, password, email_confirm: true });
    if (error || !data.user) go('/admin?add=1', `Couldn't add: ${error?.message}`);
    id = data.user!.id;
  }
  await store.saveStaff({ id, email, name, role, active: true, projects, waNumbers });
  const as = role === 'admin' ? 'an admin' : role === 'manager' ? `a building manager (${projects.join(', ')})` : `an accountant (${projects.join(', ')})`;
  await staffLog(me, `${name} (${email}) added as ${as} by ${staffName(me)}${waNumbers.length ? `; WhatsApp numbers: ${numsText(waNumbers)}` : ''}`);
  go('/admin', `${name} can now sign in as ${as}`);
}

/* ---------- WhatsApp daily limit (20 Nov 2026) ---------- */
const numsText = (l: WaNumber[]) => l.map(n => `${fmtNumber(n.number)} (${n.label}, ${n.limit} a day${n.active ? '' : ', not in use'})`).join('; ');

/** The Admin lets a number open chats with more customers for the next 24 hours, with a reason (logged). */
export async function waExtraAction(fdata: FormData) {
  const me = await requireAdmin(), number = normNumber(S(fdata, 'number')), amount = Math.round(+S(fdata, 'amount')), reason = S(fdata, 'reason').slice(0, 300);
  const back = `/admin?extra=${encodeURIComponent(number)}#wa`;
  if (!validNumber(number)) go('/admin#wa', 'That number isn\'t on anyone\'s details');
  if (!(amount >= 1 && amount <= MAX_LIMIT)) go(back, `Allow between 1 and ${MAX_LIMIT} more customers`);
  if (!reason) go(back, 'Write the reason (it goes in the activity log)');
  const store = await getStore(), who = (await store.listStaff()).filter(x => (x.waNumbers || []).some(n => n.number === number)).map(x => x.name);
  if (!who.length) go('/admin#wa', 'That number isn\'t on anyone\'s details');
  await store.waExtra({ number, amount, reason, byId: me.id, byName: staffName(me) });
  await staffLog(me, `${staffName(me)} allowed ${amount} more WhatsApp customers for the next 24 hours on ${fmtNumber(number)} (${who.join(', ')}): ${reason}`);
  go('/admin#wa', `${fmtNumber(number)} can message ${amount} more customer${amount === 1 ? '' : 's'} in the next 24 hours`);
}
