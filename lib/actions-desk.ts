'use server';
// The accountant's desk: utility bills entry, maintenance notices, and new possessions.
import { redirect } from 'next/navigation';
import type { Owner, Charge, Notice } from './types';
import { requireStaff, roleName, staffName } from './session';
import { mutate } from './ops';
import { ownerById, apartments, log, at, nid, pushMsg, createBill, sendBill, rateTypes, monthsToBill, monthCharge, nextBillFor, waive } from './engine';
import { fd, fds, fm, rs, waDigits } from './fmt';
import { blankOwner } from './seed';
import { normPhone } from './importer';
import { changeOrRequest } from './approvals';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (path: string, toast?: string): never => redirect(path + (path.includes('?') ? '&' : '?') + (toast ? 't=' + encodeURIComponent(toast) : ''));

/* ---------- utility bills ---------- */
/** Saves the month's grid: one amount (and optionally units) per flat. Billed rows are locked; 0 or empty clears. */
export async function saveChargesAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), period = S(fdata, 'period'), kind = S(fdata, 'kind') || 'Electricity';
  const back = `/p/${pid}/utilities?period=${period}&kind=${encodeURIComponent(kind)}`;
  if (!/^\d{4}-\d{2}$/.test(period)) go(back, 'Pick the month');
  const res = await mutate(pid, staff, s => {
    let added = 0, changed = 0, cleared = 0;
    for (const [k, v] of fdata.entries()) {
      if (!k.startsWith('amt:')) continue;
      const oid = k.slice(4), o = ownerById(oid); if (!o) continue;
      const raw = String(v).replace(/[,\s]/g, ''), amount = raw === '' ? 0 : Math.round(+raw);
      const units = S(fdata, 'units:' + oid) ? Math.round(+S(fdata, 'units:' + oid)) : null;
      if (!Number.isFinite(amount)) continue;
      const ex = s.charges.find(c => c.ownerId === oid && c.period === period && c.kind === kind && !c.billId);
      if (ex) {
        if (ex.amount === amount && ex.units === units) continue;
        if (!amount) cleared++; else changed++;
        ex.amount = amount; ex.units = units; ex.by = staffName(staff); ex.d = s.today;
      } else if (amount) {
        const c: Charge = { id: 'CH' + nid('ch'), ownerId: oid, project: pid, period, kind, amount, units, note: '', by: staffName(staff), d: s.today, billId: null };
        s.charges.push(c); added++;
      }
    }
    if (added || changed || cleared) log(s.today, at(15), 'admin', `${kind} bills for ${fm(period)} saved by ${staffName(staff)}: ${added} added, ${changed} changed, ${cleared} cleared`);
    return { added, changed, cleared };
  }, { send: false });
  go(back, `Saved: ${res.added} added, ${res.changed} changed${res.cleared ? `, ${res.cleared} cleared` : ''}. They go on the next bill.`);
}

/** CSV with Apartment, Amount (and optional Units) columns, for the selected month and kind. */
export async function importChargesAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), period = S(fdata, 'period'), kind = S(fdata, 'kind') || 'Electricity';
  const back = `/p/${pid}/utilities?period=${period}&kind=${encodeURIComponent(kind)}`;
  const file = fdata.get('file') as File | null;
  if (!file || !file.size) go(back, 'Pick a CSV file');
  const text = await file!.text();
  const { parseCsv } = await import('./importer');
  const rows = parseCsv(text), head = (rows[0] || []).map(h => h.trim().toLowerCase());
  const ia = head.findIndex(h => ['apartment', 'apt', 'flat', 'unit'].includes(h)), im = head.findIndex(h => ['amount', 'bill', 'electricity', 'total', 'rs'].includes(h)), iu = head.findIndex(h => ['units', 'unit used', 'kwh'].includes(h));
  if (ia < 0 || im < 0) go(back, 'The CSV needs an "Apartment" and an "Amount" column');
  const res = await mutate(pid, staff, s => {
    const byApt = new Map(apartments().filter(o => o.status === 'active').map(o => [o.apt.toUpperCase(), o]));
    let n = 0; const missing: string[] = [];
    for (const r of rows.slice(1)) {
      const apt = String(r[ia] || '').trim(), amount = Math.round(+String(r[im] || '').replace(/[,\sRs]/gi, ''));
      if (!apt) continue;
      const o = byApt.get(apt.toUpperCase());
      if (!o || !Number.isFinite(amount)) { missing.push(apt); continue; }
      const units = iu >= 0 && r[iu] ? Math.round(+r[iu]) : null;
      const ex = s.charges.find(c => c.ownerId === o.id && c.period === period && c.kind === kind && !c.billId);
      if (ex) { ex.amount = amount; ex.units = units; ex.by = staffName(staff); ex.d = s.today; }
      else s.charges.push({ id: 'CH' + nid('ch'), ownerId: o.id, project: pid, period, kind, amount, units, note: '', by: staffName(staff), d: s.today, billId: null });
      n++;
    }
    log(s.today, at(15), 'admin', `${kind} bills for ${fm(period)} imported by ${staffName(staff)} from ${file!.name}: ${n} flats${missing.length ? `, ${missing.length} not matched (${missing.slice(0, 8).join(', ')})` : ''}`);
    return { n, missing };
  }, { send: false });
  go(back, `${res.n} flats imported${res.missing.length ? `; not found: ${res.missing.slice(0, 6).join(', ')}${res.missing.length > 6 ? '…' : ''}` : ''}`);
}

/** Bills entered after this month's bills went out: bill them now on their own (utilities only) and send. */
export async function billUtilitiesNowAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), back = `/p/${pid}/utilities?period=${S(fdata, 'period')}&kind=${encodeURIComponent(S(fdata, 'kind'))}`;
  const n = await mutate(pid, staff, s => {
    const owners = [...new Set(s.charges.filter(c => !c.billId && c.amount && c.period <= s.today.slice(0, 7)).map(c => c.ownerId))].map(ownerById).filter(o => o && o.status === 'active');
    owners.forEach(o => { const b = createBill(o, s.today, { utilitiesOnly: true }); if (b.net) sendBill(o, b, s.today); });
    if (owners.length) log(s.today, at(15), 'bill', `Utility bills sent now for ${owners.length} flat${owners.length === 1 ? '' : 's'} by ${staffName(staff)}`);
    return owners.length;
  });
  go(back, n ? `Bills sent to ${n} flat${n === 1 ? '' : 's'}` : 'Nothing waiting to be billed');
}

/* ---------- maintenance notices ---------- */
export async function sendNoticeAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), back = `/p/${pid}/send?mode=notice`;
  const kind = S(fdata, 'kind') || 'custom', title = S(fdata, 'title') || 'Notice', text = S(fdata, 'text'), aud = S(fdata, 'aud') || 'all';
  if (!text) go(back, 'Write the message first');
  const picked = new Set(fdata.getAll('apt').map(String));
  const res = await mutate(pid, staff, s => {
    const t = at(15), act = s.owners.filter(o => o.status === 'active');
    const list = aud === 'all' ? act : aud.startsWith('block:') ? act.filter(o => o.block === aud.slice(6)) : act.filter(o => picked.has(o.id));
    let failed = 0;
    for (const o of list) {
      const m = pushMsg(o, s.today, t, { kind: 'alert', title, text: `${title}\n\n${text}`, tpl: 'alert', vars: { project: s.proj.name, title, text }, manual: true });
      if (m.status === 'failed') failed++;
    }
    const audience = aud === 'all' ? 'All owners' : aud.startsWith('block:') ? `Block ${aud.slice(6)}` : list.map(o => o.apt).join(', ');
    const n: Notice = { id: 'NT' + nid('nt'), project: pid, d: s.today, t, kind, title, text, audience, count: list.length, failed, by: staffName(staff) };
    s.notices.push(n);
    log(s.today, t, 'message', `Notice "${title}" prepared for ${list.length} owner${list.length === 1 ? '' : 's'} (${audience})${failed ? `, ${failed} without a working number` : ''} by ${staffName(staff)}; to be sent by hand`);
    return { n: list.length, failed, id: n.id };
  });
  // Sending by hand: straight on to sending it, one chat at a time.
  if (res.n > res.failed) go(`/p/${pid}/send?type=queue&notice=${res.id}&go=1`, `Notice ready for ${res.n - res.failed} owner${res.n - res.failed === 1 ? '' : 's'}: open each chat and press Send`);
  go(back, res.n ? `Notice prepared for ${res.n} owner${res.n === 1 ? '' : 's'}${res.failed ? `; ${res.failed} ${res.failed === 1 ? 'has' : 'have'} no working number` : ''}` : 'Nobody matched that audience');
}

/* ---------- new possession ---------- */
export async function possessionAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), back = `/p/${pid}/apartments`;
  const apt = S(fdata, 'apt').toUpperCase(), name = S(fdata, 'name'), possession = S(fdata, 'possession'), type = S(fdata, 'type'), phone = S(fdata, 'phone');
  if (!apt || !name || !/^\d{4}-\d{2}-\d{2}$/.test(possession) || !type) go(back + '?m=possession', 'Fill in the apartment, type, owner and possession date');
  if (phone && waDigits(phone).length < 10) go(back + '?m=possession', 'That WhatsApp number looks too short. Include the country code, e.g. +92.');
  const out = await mutate(pid, staff, s => {
    if (s.owners.some(o => o.status === 'active' && o.apt.toUpperCase() === apt)) return { err: `${apt} already has an owner. For a sale, use Transfer on that apartment.` };
    if (!rateTypes().includes(type)) return { err: `${type} has no rate yet. An admin adds it in Settings › Monthly fees.` };
    const plan = (['monthly', 'quarterly', 'annual'].includes(S(fdata, 'plan')) ? S(fdata, 'plan') : 'monthly') as Owner['plan'];
    const o = blankOwner({ id: 'O' + nid('o'), project: pid, apt, block: S(fdata, 'block') || apt.split(/[-\s]/)[0], type, name, phone: phone ? normPhone(phone) : '', email: S(fdata, 'email'),
      possession, possessionKnown: true, plan, invalidPhone: !phone, noPhone: !phone,
      notes: [{ d: s.today, by: staffName(staff), text: `Possession handed over on ${fd(possession)}.${S(fdata, 'note') ? ' ' + S(fdata, 'note') : ''}` }] });
    s.owners.push(o);
    // When the first bill goes out, and what it covers.
    const next = nextBillFor(o);
    const months = monthsToBill(o, next), first = months.length ? monthCharge(o, months[0]) : null;
    log(s.today, at(15), 'admin', `New possession: ${apt} (${type}) handed over to ${name} on ${fd(possession)} by ${staffName(staff)}. ${plan} billing; first bill on ${fd(next)}`, o.id);
    return { id: o.id, next, prorated: first && first.from ? `${fm(months[0])} prorated from ${fds(first.from)} (${rs(first.amount)})` : '' };
  }, { send: false });
  if ('err' in out) go(back + '?m=possession', out.err);
  const ok = out as { id: string; next: string; prorated: string };
  go(`/p/${pid}/apartments/${ok.id}`, `Possession recorded. First bill on ${fd(ok.next)}${ok.prorated ? `: ${ok.prorated}` : ''}.`);
}

/* ---------- adjustments (manual corrections) ---------- */
/** A charge (goes on the next bill) or a credit/waiver (lowers what is owed now), with a reason. */
export async function adjustAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), kind = S(fdata, 'kind'), reason = S(fdata, 'reason');
  const amount = Math.round(+S(fdata, 'amount').replace(/[,\s]/g, '')), back = `/p/${pid}/apartments/${oid}`;
  if (!(amount > 0) || !reason) go(back + '?m=adjust', 'Enter an amount and the reason');
  // An admin's adjustment applies now; an accountant's waits for an admin's approval.
  // The reason the accountant gives is also their reason for the admin.
  let r: Awaited<ReturnType<typeof changeOrRequest>> | null = null, err = '';
  try { r = await mutate(pid, staff, s => { const o = ownerById(oid); if (!o) throw new Error('Apartment not found'); return changeOrRequest(o, 'adjust', { kind: kind === 'credit' ? 'credit' : 'charge', amount, reason }, reason); }, { send: false }); }
  catch (e) { err = (e as Error).message; }
  if (!r) go(back + '?m=adjust', err || 'Not saved');
  go(r!.done === 'applied' ? back + '?tab=history' : back, r!.text);
}

/* ---------- company details (admins) ---------- */
export async function companyAction(fdata: FormData) {
  const { requireAdmin } = await import('./session');
  const staff = await requireAdmin();
  const { getStore } = await import('./store'), { staffLog } = await import('./ops');
  await (await getStore()).saveCompany({ legalName: S(fdata, 'legalName') || 'Minawa (Pvt) Ltd', address: S(fdata, 'address'), ntn: S(fdata, 'ntn'), phone: S(fdata, 'phone'), email: S(fdata, 'email') });
  await staffLog(staff, `Company details changed by ${staffName(staff)}`);
  go('/admin', 'Company details saved. They print on every bill and receipt.');
}
