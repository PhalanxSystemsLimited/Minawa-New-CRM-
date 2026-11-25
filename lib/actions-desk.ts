'use server';
// The accountant's desk: utility bills entry, maintenance notices, and new possessions.
import { redirect } from 'next/navigation';
import type { Owner, Charge, Notice } from './types';
import { requireStaff, requireRole, roleName, staffName } from './session';
import { mutate } from './ops';
import { ownerById, apartments, log, at, nid, pushMsg, createBill, sendBill, rateTypes, monthsToBill, monthCharge, nextBillFor, waive } from './engine';
import { fd, fds, fm, rs, waDigits } from './fmt';
import { blankOwner } from './seed';
import { normPhone } from './importer';
import { changeOrRequest, addPossession, requestChange } from './approvals';
import { normCnic, flatByApt, possessionWaiting } from './people';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const go = (path: string, toast?: string): never => redirect(path + (path.includes('?') ? '&' : '?') + (toast ? 't=' + encodeURIComponent(toast) : ''));

/* ---------- utility bills ---------- */
/** Saves the month's grid: one amount (and optionally units) per flat. Billed rows are locked; 0 or empty clears. */
export async function saveChargesAction(fdata: FormData) {
  const staff = await requireRole('accountant'), pid = S(fdata, 'pid'), period = S(fdata, 'period'), kind = S(fdata, 'kind') || 'Electricity', due = S(fdata, 'due');
  const back = `/p/${pid}/utilities?period=${period}&kind=${encodeURIComponent(kind)}`;
  if (!/^\d{4}-\d{2}$/.test(period)) go(back, 'Pick the month');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) go(back, 'Pick the due date for these bills');
  const num = (k: string) => { const v = S(fdata, k).replace(/[,\s]/g, ''); return v === '' || !Number.isFinite(+v) ? null : Math.round(+v); };
  let res = { added: 0, changed: 0, cleared: 0, billed: 0 };
  try { res = await mutate(pid, staff, s => {
    let added = 0, changed = 0, cleared = 0;
    for (const [k] of fdata.entries()) {
      if (!k.startsWith('amt:')) continue;
      const oid = k.slice(4), o = ownerById(oid); if (!o) continue;
      const amount = num(k) || 0, units = num('units:' + oid), prevReading = num('prev:' + oid), curReading = num('cur:' + oid);
      if (prevReading != null && curReading != null && curReading < prevReading) throw new Error(`${o.apt}: the current reading is lower than the previous one`);
      const ex = s.charges.find(c => c.ownerId === oid && c.period === period && c.kind === kind && !c.billId);
      if (ex) {
        if (ex.amount === amount && ex.units === units && (ex.curReading ?? null) === curReading) continue;
        if (!amount) cleared++; else changed++;
        Object.assign(ex, { amount, units, prevReading, curReading, by: staffName(staff), d: s.today });
      } else if (amount) {
        const c: Charge = { id: 'CH' + nid('ch'), ownerId: oid, project: pid, period, kind, amount, units, note: '', by: staffName(staff), d: s.today, billId: null, prevReading, curReading };
        s.charges.push(c); added++;
      }
    }
    // Phase 3: each flat's bill is made at once (its own bill, due on the date picked) and waits in the building
    // manager's To do to be sent.
    let billed = 0;
    const owners = [...new Set(s.charges.filter(c => !c.billId && c.amount && c.kind === kind && c.period === period).map(c => c.ownerId))].map(ownerById).filter(o => o && o.status === 'active');
    for (const o of owners) { const b = createBill(o, s.today, { utilitiesOnly: true, due }); if (b.net) { sendBill(o, b, s.today); billed++; } }
    log(s.today, at(15), 'bill', `${kind} bills for ${fm(period)} entered by ${staffName(staff)}: ${added} added, ${changed} changed${cleared ? `, ${cleared} cleared` : ''}; ${billed} bill${billed === 1 ? '' : 's'} made, due ${fd(due)}`);
    return { added, changed, cleared, billed };
  }, { send: false }); } catch (e) { go(back, (e as Error).message); }
  go(back, `${res.billed} ${kind.toLowerCase()} bill${res.billed === 1 ? '' : 's'} made, due ${fd(due)}. They are in your To do to send on WhatsApp.`);
}

/** An Excel sheet (.xlsx) or CSV with Apartment, Amount (and optional Units) columns, for the selected month and kind. */
export async function importChargesAction(fdata: FormData) {
  const staff = await requireRole('accountant'), pid = S(fdata, 'pid'), period = S(fdata, 'period'), kind = S(fdata, 'kind') || 'Electricity';
  const back = `/p/${pid}/utilities?period=${period}&kind=${encodeURIComponent(kind)}`;
  const file = fdata.get('file') as File | null;
  if (!file || !file.size) go(back, 'Pick the Excel sheet (or a CSV file)');
  // The sheet downloaded from this page (Excel), or a CSV.
  const bytes = new Uint8Array(await file!.arrayBuffer()), isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b;
  let rows: string[][] = [];
  if (isXlsx) { const { readXlsx } = await import('./xlsx'); try { rows = readXlsx(bytes); } catch { go(back, 'This Excel file couldn\'t be read. Save it again as .xlsx (or CSV) and try again'); } }
  else if (/\.xls$/i.test(file!.name)) go(back, 'This is an old Excel file (.xls). Save it as .xlsx (or CSV) and try again');
  else { const { parseCsv } = await import('./importer'); rows = parseCsv(new TextDecoder().decode(bytes).replace(/^\uFEFF/, '')); }
  const head = (rows[0] || []).map(h => String(h || '').replace(/\(.*?\)/g, '').trim().toLowerCase());
  const ia = head.findIndex(h => ['apartment', 'apt', 'flat', 'unit'].includes(h)), im = head.findIndex(h => ['amount', 'bill', 'electricity', 'total', 'rs'].includes(h)), iu = head.findIndex(h => ['units', 'unit used', 'kwh'].includes(h));
  if (ia < 0 || im < 0) go(back, 'The sheet needs an "Apartment" and an "Amount" column on its first row');
  const res = await mutate(pid, staff, s => {
    const byApt = new Map(apartments().filter(o => o.status === 'active').map(o => [o.apt.toUpperCase(), o]));
    let n = 0; const missing: string[] = [];
    for (const r of rows.slice(1)) {
      const apt = String(r[ia] || '').trim(), amount = Math.round(+String(r[im] || '').replace(/[,\sRs]/gi, ''));
      if (!apt || !String(r[im] ?? '').trim()) continue;          // no amount filled in: leave that flat as it is
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
  const staff = await requireRole('accountant'), pid = S(fdata, 'pid'), back = `/p/${pid}/utilities?period=${S(fdata, 'period')}&kind=${encodeURIComponent(S(fdata, 'kind'))}`;
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
  const staff = await requireRole('accountant'), pid = S(fdata, 'pid'), back = `/p/${pid}/send?mode=notice`;
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
  const staff = await requireStaff(), pid = S(fdata, 'pid'), b0 = S(fdata, 'back');
  // Back to the screen it was started from (the Apartments screen, an apartment, or the building's list).
  const back = /^\/(apartments|p\/)/.test(b0) && !b0.startsWith('//') ? b0.replace(/[?&]m=possession\b.*$/, '') : `/p/${pid}/apartments`;
  const c = { apt: S(fdata, 'apt').toUpperCase(), block: S(fdata, 'block'), floor: S(fdata, 'floor'), type: S(fdata, 'type'), name: S(fdata, 'name').replace(/\s+/g, ' '), phone: S(fdata, 'phone'), email: S(fdata, 'email'),
    cnic: normCnic(S(fdata, 'cnic')) || '', cnicExpiry: S(fdata, 'cnicExpiry'), cnicAddress: S(fdata, 'cnicAddress').replace(/\s+/g, ' '),
    possession: S(fdata, 'possession'), plan: S(fdata, 'plan') || 'monthly', note: S(fdata, 'note'), reading: S(fdata, 'reading') };
  const again = `${back}${back.includes('?') ? '&' : '?'}m=possession${/^\/apartments\/?(\?|$)/.test(back) && !/[?&]p=/.test(back) ? `&p=${pid}` : ''}&pp=${encodeURIComponent(back)}${c.apt ? `&flat=${encodeURIComponent(c.apt)}` : ''}`;
  if (!c.apt) go(again, 'Choose the apartment from the list of available apartments');
  if (!c.name || !/^\d{4}-\d{2}-\d{2}$/.test(c.possession) || !c.type) go(again, 'Fill in the type, the customer\'s full name and the possession date');
  if (!c.cnic) go(again, 'Enter the CNIC number: 13 digits, e.g. 12345-1234567-1');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.cnicExpiry)) go(again, 'Enter the CNIC expiry date');
  if (!c.cnicAddress) go(again, 'Enter the address on the CNIC');
  if (!c.phone) go(again, 'Enter the customer\'s WhatsApp number');
  if (waDigits(c.phone).length < 10) go(again, 'That WhatsApp number looks too short. Include the country code, e.g. +92.');
  if (!/^\d+$/.test(c.reading)) go(again, 'Enter the meter reading now (numbers only)');
  // An Admin records it at once. A building manager's (or accountant's) possession waits for an Admin's approval:
  // until then the flat isn't billed.
  let out: { id?: string; next?: string; cid?: string; requested?: boolean } | null = null, err = '';
  try {
    out = await mutate(pid, staff, s => {
      // Only an empty flat (nobody has it, nothing waiting for it), checked again here.
      const f = flatByApt(c.apt);
      if (!f) throw new Error(`${c.apt} isn't one of this building's apartments. The Admin adds apartments on the Apartments screen.`);
      if (f.status === 'occupied') throw new Error(`${f.apt} is already possessed (${f.owner?.name}). Choose an available apartment.`);
      if (possessionWaiting(f.apt)) throw new Error(`${f.apt} is already booked: a possession is waiting for the Admin's approval.`);
      Object.assign(c, { apt: f.apt, block: c.block || f.block, floor: c.floor || f.floor });
      if (s.role === 'admin') return addPossession(c, staffName(staff));
      requestChange(null, 'possession', c, c.note || 'New possession handed over');
      return { requested: true };
    }, { send: false });
  } catch (e) { err = (e as Error).message; }
  if (!out) go(again, err || 'Not saved');
  if (out!.requested) go(back, `Sent to the Admin for approval: ${c.apt} to ${c.name} from ${fd(c.possession)}. ${c.apt} shows as booked until then, and is billed once approved.`);
  go(`/customers/${pid}/${out!.id}`, `Possession recorded: ${out!.cid} ${c.name} in ${c.apt}. First bill on ${fd(out!.next!)}.`);
}

/* ---------- adjustments (manual corrections) ---------- */
/** A charge (goes on the next bill) or a credit/waiver (lowers what is owed now), with a reason. */
export async function adjustAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), kind = S(fdata, 'kind'), reason = S(fdata, 'reason');
  const amount = Math.round(+S(fdata, 'amount').replace(/[,\s]/g, '')), back = S(fdata, 'back') === `/customers/${pid}/${oid}` ? `/customers/${pid}/${oid}` : `/p/${pid}/apartments/${oid}`;
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

/* ---------- instalment plans and a due day for one owner (Admin applies; others ask the Admin) ---------- */
export async function instalmentAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), back = S(fdata, 'back') === `/customers/${pid}/${oid}` ? `/customers/${pid}/${oid}` : `/p/${pid}/apartments/${oid}`;
  const amounts = fdata.getAll('amount').map(x => Math.round(+String(x).replace(/[,\s]/g, '') || 0)), dues = fdata.getAll('due').map(String);
  const items = amounts.map((amount, i) => ({ amount, due: dues[i] || '' })), n = items.length;
  let r: Awaited<ReturnType<typeof changeOrRequest>> | null = null, err = '';
  try { r = await mutate(pid, staff, () => { const o = ownerById(oid); if (!o) throw new Error('Apartment not found'); return changeOrRequest(o, 'instalments', { items }, S(fdata, 'reason')); }, { send: false }); }
  catch (e) { err = (e as Error).message; }
  if (!r) go(`${back}?m=instal-${n}`, err || 'Not saved');
  go(back, r!.text);
}
export async function dueAction(fdata: FormData) {
  const staff = await requireStaff(), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), back = S(fdata, 'back') === `/customers/${pid}/${oid}` ? `/customers/${pid}/${oid}` : `/p/${pid}/apartments/${oid}`;
  let r: Awaited<ReturnType<typeof changeOrRequest>> | null = null, err = '';
  try { r = await mutate(pid, staff, () => { const o = ownerById(oid); if (!o) throw new Error('Apartment not found'); return changeOrRequest(o, 'due', { dueDay: Math.round(+S(fdata, 'dueDay')) }, S(fdata, 'reason')); }, { send: false }); }
  catch (e) { err = (e as Error).message; }
  if (!r) go(`${back}?m=due`, err || 'Not saved');
  go(back, r!.text);
}

/** Discontinue (or resume) a customer's maintenance after the late warning: the building manager asks, the Admin approves. */
export async function discontinueAction(fdata: FormData) {
  const staff = await requireRole('accountant', 'admin'), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), on = S(fdata, 'on') === '1', reason = S(fdata, 'reason');
  const back = S(fdata, 'back') === `/customers/${pid}/${oid}` ? `/customers/${pid}/${oid}` : `/p/${pid}/apartments/${oid}`;
  if (staff.role !== 'admin' && !reason) go(`${back}?m=discontinue`, 'Write the reason for the Admin');
  let r = '';
  try { r = await mutate(pid, staff, () => { const o = ownerById(oid); if (!o) throw new Error('Apartment not found'); return changeOrRequest(o, 'discontinue', { on }, reason).text; }, { send: false }); }
  catch (e) { go(back, (e as Error).message); }
  go(back, r);
}

/** A customer leaves and hands back the keys (Phase 3): only once every charge up to the leaving date is paid. The
 *  building manager asks; the Admin approves (an Admin's own is done at once). */
export async function leaveAction(fdata: FormData) {
  const staff = await requireRole('accountant', 'admin'), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), date = S(fdata, 'date'), reading = S(fdata, 'reading'), reason = S(fdata, 'reason');
  const back = `/p/${pid}/apartments/${oid}/leave?d=${encodeURIComponent(date)}${/^\d+$/.test(reading) ? `&r=${reading}` : ''}`;
  if (staff.role !== 'admin' && !reason) go(back, 'Write a note for the Admin (for example: keys handed back on the leaving date)');
  let r = '';
  try { r = await mutate(pid, staff, () => { const o = ownerById(oid); if (!o) throw new Error('Apartment not found'); return changeOrRequest(o, 'leave', { date, reading: reading === '' ? null : Math.round(+reading) }, reason || 'Keys handed back').text; }, { send: false }); }
  catch (e) { go(back, (e as Error).message); }
  go(back, r);
}
