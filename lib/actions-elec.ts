'use server';
// Electricity bills, one customer at a time (21 Nov 2026, Oakwood): the building manager enters a customer's bill
// (amount, units, the meter reading on the bill, the due date, and a photo of it if he has one); the customer is
// billed at once and the bill waits in Send on WhatsApp. Until any money reaches the bill he can still correct it
// (the customer is sent the corrected bill); once it is paid it is history and can't be changed.
import { redirect } from 'next/navigation';
import { requireRole, staffName } from './session';
import { mutate } from './ops';
import { getStore } from './store';
import { ownerById, log, at, nid, createBill, sendBill, isUtilBill, periodLabel } from './engine';
import { ELEC_RATE, billReading, correctReading, meterMode, fineOfferFor } from './meter';
import { changeOrRequest } from './approvals';
import { addDays, fd, fm, rs } from './fmt';
import { photoFor } from './actions-photos';
import type { Bill } from './types';
import { elecLocked, elecLabel as label } from './elec';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const KIND = 'Electricity';
const int = (v: string) => { const x = v.replace(/[,\s]/g, ''); return /^\d+$/.test(x) ? +x : null; };
const goTo = (path: string, msg: string): never => redirect(`${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(msg)}`);


export async function addElecBillAction(fdata: FormData) {
  const staff = await requireRole('manager'), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), period = S(fdata, 'period'), due = S(fdata, 'due'), photo = S(fdata, 'photo');
  const back = `/p/${pid}/electricity?tab=add${S(fdata, 'q') ? `&q=${encodeURIComponent(S(fdata, 'q'))}` : ''}&period=${period}`;
  const again = `${back}&m=elecadd&oid=${encodeURIComponent(oid)}`;
  const amount = int(S(fdata, 'amount')), units = int(S(fdata, 'units')), reading = int(S(fdata, 'reading'));
  if (!/^\d{4}-\d{2}$/.test(period)) goTo(again, 'Pick the bill month');
  if (!amount) goTo(again, 'Enter the bill amount (Rs)');
  if (units == null) goTo(again, 'Enter the units on the bill');
  if (reading == null) goTo(again, 'Enter the meter reading on the bill');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) goTo(again, 'Pick the due date');
  let err = '', out: { b: Bill; apt: string; name: string } | null = null;
  try {
    if (photo) await photoFor(photo, pid, 'bill');
    out = await mutate(pid, staff, s => {
      const o = ownerById(oid);
      if (!o || o.status !== 'active') throw new Error('This customer isn\'t active here');
      if (!s.settings.rules.utilities.includes(KIND)) throw new Error('Electricity isn\'t billed in this building');
      if (s.charges.some(c => c.ownerId === oid && c.period === period && c.kind === KIND && c.billId)) throw new Error(`${o.apt} already has its ${fm(period)} electricity bill. Use Edit on it (while unpaid).`);
      const who = staffName(staff), ex = s.charges.find(c => c.ownerId === oid && c.period === period && c.kind === KIND && !c.billId);
      if (ex) Object.assign(ex, { amount: amount!, units, curReading: reading, prevReading: null, by: who, d: s.today });
      else s.charges.push({ id: 'CH' + nid('ch'), ownerId: oid, project: pid, period, kind: KIND, amount: amount!, units, note: '', by: who, d: s.today, billId: null, prevReading: null, curReading: reading });
      const b = createBill(o, s.today, { utilitiesOnly: true, due });
      // The bill line says what the bill paper says: units and the meter reading on it.
      const c = s.charges.find(x => x.billId === b.id && x.ownerId === oid && x.period === period && x.kind === KIND);
      const line = b.lines.find(l => l.kind === 'utility' && l.label.startsWith(`${KIND}, ${fm(period)}`));
      if (c && line) line.label = label(c);
      if (photo) b.photoId = photo;
      if (b.net) sendBill(o, b, s.today);
      log(s.today, at(15), 'bill', `${KIND} bill for ${o.apt}, ${fm(period)}, entered by ${who}: ${rs(amount!)} (${units} units, meter reading ${reading}), due ${fd(due)}; bill ${b.id}`, o.id);
      return { b, apt: o.apt, name: o.name };
    }, { send: false });
    if (photo && out) await (await getStore()).linkImage(photo, out.b.id);
  } catch (e) { err = (e as Error).message; }
  if (!out) goTo(again, err || 'Not saved');
  goTo(back, `${out!.apt} billed: ${rs(out!.b.net)} for ${fm(period)}, due ${fd(out!.b.dueDate)}. It is waiting in Send on WhatsApp.`);
}

export async function editElecBillAction(fdata: FormData) {
  const staff = await requireRole('manager'), pid = S(fdata, 'pid'), billId = S(fdata, 'bill'), due = S(fdata, 'due'), from = S(fdata, 'from') === 'add' ? 'add' : 'bills';
  const back = from === 'add' ? `/p/${pid}/electricity?tab=add${S(fdata, 'period') ? `&period=${S(fdata, 'period')}` : ''}` : `/p/${pid}/electricity`;
  const again = `${back}${back.includes('?') ? '&' : '?'}m=elecedit-${encodeURIComponent(billId)}`;
  const amount = int(S(fdata, 'amount')), units = int(S(fdata, 'units')), reading = int(S(fdata, 'reading'));
  const isMeter = S(fdata, 'meter') === '1';
  if (!isMeter && !amount) goTo(again, 'Enter the bill amount (Rs)');
  if (!isMeter && units == null) goTo(again, 'Enter the units on the bill');
  if (reading == null) goTo(again, isMeter ? 'Enter the reading' : 'Enter the meter reading on the bill');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) goTo(again, 'Pick the due date');
  let err = '', msg = '';
  try {
    msg = await mutate(pid, staff, s => {
      const b = s.bills.find(x => x.id === billId);
      if (!b || !isUtilBill(b)) throw new Error('This electricity bill isn\'t there any more');
      const why = elecLocked(b); if (why) throw new Error(`It can't be changed: ${why.toLowerCase()}`);
      const o = ownerById(b.ownerId), chs = s.charges.filter(c => c.billId === b.id && c.kind === KIND);
      if (meterMode() && chs.length === 1 && chs[0].prevReading != null) {
        // Sub-meters: the reading is corrected; units and amount follow at the bill's unit rate.
        const what = correctReading(b, reading!, S(fdata, 'prev') ? int(S(fdata, 'prev')) : null, due, staffName(staff));
        s.messages.filter(m => m.status === 'pending' && m.pdf?.id === b.id).forEach(m => { m.status = 'skipped'; m.error = 'Replaced by the corrected bill'; });
        const n1 = s.messages.length; sendBill(o, b, s.today); for (const m of s.messages.slice(n1)) m.title = `Corrected bill · ${periodLabel(b)}`;
        log(s.today, at(15), 'bill', `Electricity bill ${b.id} for ${o.apt} corrected by ${staffName(staff)}: ${what}; due ${fd(due)}`, o.id);
        return `${o.apt}'s bill corrected: ${what}. The corrected bill is waiting in Send on WhatsApp.`;
      }
      if (chs.length !== 1) throw new Error('This bill has more than one electricity charge; ask the Admin to correct it');
      const c = chs[0], old = { amount: c.amount, units: c.units, reading: c.curReading, due: b.dueDate };
      const line = b.lines.find(l => l.kind === 'utility' && l.label.startsWith(`${KIND}, ${fm(c.period)}`));
      const diff = amount! - c.amount;
      Object.assign(c, { amount: amount!, units, curReading: reading, by: staffName(staff), d: s.today });
      if (line) { line.amount = amount!; line.label = label(c); }
      b.extras += diff; b.net += diff;
      b.dueDate = due; b.finalDate = addDays(due, s.settings.rules.warnAfter ?? 15);
      const e = s.entries.find(x => x.ref === b.id && x.kind === 'utility' && x.ownerId === o.id);
      if (e) e.amount = amount!;
      // The customer gets the corrected bill: one still waiting to be sent is replaced; one already sent is followed
      // by the corrected one.
      const waiting = s.messages.filter(m => m.status === 'pending' && m.pdf?.id === b.id);
      waiting.forEach(m => { m.status = 'skipped'; m.error = 'Replaced by the corrected bill'; });
      const n0 = s.messages.length;
      sendBill(o, b, s.today);
      for (const m of s.messages.slice(n0)) m.title = `Corrected bill · ${periodLabel(b)}`;
      const ch: string[] = [];
      if (old.amount !== amount) ch.push(`amount ${rs(old.amount)} → ${rs(amount!)}`);
      if (old.units !== units) ch.push(`units ${old.units ?? '—'} → ${units}`);
      if (old.reading !== reading) ch.push(`meter reading ${old.reading ?? '—'} → ${reading}`);
      if (old.due !== due) ch.push(`due ${fd(old.due)} → ${fd(due)}`);
      log(s.today, at(15), 'bill', `${KIND} bill ${b.id} for ${o.apt} (${fm(c.period)}) corrected by ${staffName(staff)}: ${ch.join('; ') || 'no change'}; corrected bill waiting in Send on WhatsApp`, o.id);
      return `${o.apt}'s ${fm(c.period)} bill corrected${ch.length ? `: ${ch.join('; ')}` : ''}. The corrected bill is waiting in Send on WhatsApp.`;
    }, { send: false });
  } catch (e) { err = (e as Error).message; }
  goTo(err ? again : back, err || msg);
}

/** The Admin's electricity settings (21 Nov 2026): how bills are made (from the paper bill, or sub-meters x the unit
 *  rate), the unit rate from a date, the reading day, the due date, the reminder days and the late-fine steps. */
export async function elecSettingsAction(fdata: FormData) {
  const staff = await requireRole('admin'), pid = S(fdata, 'pid'), back = `/p/${pid}/settings`;
  const mode = S(fdata, 'mode'), rate = int(S(fdata, 'rate')), from = S(fdata, 'rateFrom'), readDay = int(S(fdata, 'readDay')), dueDays = int(S(fdata, 'dueDays'));
  const remind = S(fdata, 'remind').split(/[,\s]+/).filter(Boolean).map(Number);
  const fine = fdata.getAll('fineDays').map((d, i) => ({ days: Number(d), pct: Number(fdata.getAll('finePct')[i]) })).filter(x => String(x.days) !== 'NaN' && x.pct > 0);
  let err = '', msg = '';
  try {
    if (!['off', 'bill', 'meter'].includes(mode)) throw new Error('Choose how electricity is billed');
    if (remind.some(n => !Number.isInteger(n) || n < -30 || n > 90)) throw new Error('Reminder days are whole numbers from -30 (before the due date) to 90 (after it)');
    if (fine.some(x => !Number.isInteger(x.days) || x.days < 1 || x.days > 365 || x.pct > 50)) throw new Error('Fine steps: from 1 to 365 days late, at most 50%');
    if (mode === 'meter') {
      if (readDay == null || readDay < 1 || readDay > 28) throw new Error('The reading day is a day of the month from 1 to 28');
      if (dueDays == null || dueDays < 1 || dueDays > 60) throw new Error('Bills are due 1 to 60 days after they are made');
    }
    if (rate != null && rate > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('Pick the date the unit rate starts');
    msg = await mutate(pid, staff, s => {
      const r = s.settings.rules, who = staffName(staff), ch: string[] = [];
      const utils = r.utilities.filter(u => u !== KIND);
      if (mode !== 'off') utils.push(KIND);
      const was = !r.utilities.includes(KIND) ? 'off' : r.elecMode === 'meter' ? 'meter' : 'bill';
      if (was !== mode) ch.push(`billing ${was} → ${mode}`);
      r.utilities = utils; r.elecMode = mode === 'meter' ? 'meter' : 'bill';
      if (readDay != null && readDay !== r.elecReadDay) { ch.push(`reading day ${r.elecReadDay ?? '—'} → ${readDay}`); r.elecReadDay = readDay; }
      if (dueDays != null && dueDays !== r.elecDueDays) { ch.push(`due ${dueDays} days after the bill`); r.elecDueDays = dueDays; }
      const rem = [...new Set(remind)].sort((a, b) => a - b);
      if (rem.join(',') !== (r.elecRemind || [3]).join(',')) { ch.push(`reminders ${rem.join(', ') || 'none'} days from the due date`); r.elecRemind = rem; }
      const fn = fine.sort((a, b) => a.days - b.days);
      if (JSON.stringify(fn) !== JSON.stringify(r.elecFine || [])) { ch.push(`late fine ${fn.map(x => `${x.pct}% from ${x.days} days`).join(', ') || 'none'}`); r.elecFine = fn; }
      if (rate != null && rate > 0) {
        const x = s.rates.find(y => y.type === ELEC_RATE && y.from === from);
        if (!x || x.amount !== rate) {
          if (x) x.amount = rate; else s.rates.push({ id: `${s.project}:${ELEC_RATE}:${from}`, project: s.project, type: ELEC_RATE, from, amount: rate });
          ch.push(`unit rate ${rs(rate)} from ${fd(from)}`);
        }
      }
      if (!ch.length) return 'Nothing changed';
      log(s.today, at(15), 'admin', `Electricity settings for ${s.proj.name} changed by ${who}: ${ch.join('; ')}`);
      return `Electricity settings saved: ${ch.join('; ')}`;
    }, { send: false });
  } catch (e) { err = (e as Error).message; }
  redirect(`${back}?t=${encodeURIComponent(err ? `Not saved: ${err}` : msg)}#elec`);
}

/* ---------- sub-meters (Country Club) ---------- */
const meterBack = (pid: string, period: string, q: string) => `/p/${pid}/electricity?tab=add&period=${period}${q ? `&q=${encodeURIComponent(q)}` : ''}`;

/** Enter readings: bills every flat with a reading on the page (all or nothing: one wrong reading stops the save). */
export async function saveReadingsAction(fdata: FormData) {
  const staff = await requireRole('manager'), pid = S(fdata, 'pid'), period = S(fdata, 'period'), back = meterBack(pid, period, S(fdata, 'q'));
  const rows: { oid: string; cur: number; prev: number | null }[] = [];
  for (const [k, v] of fdata.entries()) {
    if (!k.startsWith('cur:') || !String(v).trim()) continue;
    const oid = k.slice(4), cur0 = int(String(v)), pv = S(fdata, `prev:${oid}`);
    if (cur0 == null) goTo(back, 'Readings are whole numbers');
    rows.push({ oid, cur: cur0!, prev: pv ? int(pv) : null });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) goTo(back, 'Pick the month');
  if (!rows.length) goTo(back, 'Type at least one reading');
  let err = '', n = 0, total = 0;
  try {
    await mutate(pid, staff, () => {
      for (const r of rows) { const o = ownerById(r.oid); if (!o) continue; const b = billReading(o, period, r.cur, r.prev, staffName(staff)); n++; total += b.net; }
    }, { send: false });
  } catch (e) { err = (e as Error).message; }
  goTo(back, err ? `Nothing saved: ${err}` : `${n} bill${n === 1 ? '' : 's'} made for ${fm(period)} (${rs(total)}). They are waiting in Send on WhatsApp.`);
}

/** One reading with a photo of the meter. */
export async function readingAction(fdata: FormData) {
  const staff = await requireRole('manager'), pid = S(fdata, 'pid'), oid = S(fdata, 'oid'), period = S(fdata, 'period'), photo = S(fdata, 'photo');
  const back = meterBack(pid, period, S(fdata, 'q')), again = `${back}&m=reading&oid=${encodeURIComponent(oid)}`;
  const cur0 = int(S(fdata, 'cur')), prev = S(fdata, 'prev') ? int(S(fdata, 'prev')) : null;
  if (cur0 == null) goTo(again, 'Enter the reading now');
  let err = '', out: { apt: string; net: number; id: string } | null = null;
  try {
    if (photo) await photoFor(photo, pid, 'bill');
    out = await mutate(pid, staff, () => { const o = ownerById(oid); if (!o) throw new Error('Customer not found'); const b = billReading(o, period, cur0!, prev, staffName(staff), photo || null); return { apt: o.apt, net: b.net, id: b.id }; }, { send: false });
    if (photo && out) await (await getStore()).linkImage(photo, out.id);
  } catch (e) { err = (e as Error).message; }
  if (!out) goTo(again, err || 'Not saved');
  goTo(back, `${out!.apt} billed ${rs(out!.net)} for ${fm(period)}. It is waiting in Send on WhatsApp.`);
}

/** The building manager asks for a late fine on an overdue electricity bill (the Admin approves; an Admin's applies). */
export async function elecFineAction(fdata: FormData) {
  const staff = await requireRole('manager', 'admin'), pid = S(fdata, 'pid'), billId = S(fdata, 'bill'), reason = S(fdata, 'reason'), back = `/p/${pid}/electricity`;
  let err = '', msg = '';
  try {
    msg = await mutate(pid, staff, s => {
      const b = s.bills.find(x => x.id === billId); if (!b || !isUtilBill(b)) throw new Error('That electricity bill isn\'t there any more');
      const o = ownerById(b.ownerId), f = fineOfferFor(b, s.today);
      if (f.late <= 0) throw new Error('The bill isn\'t late yet');
      if (!f.pct) throw new Error(`No fine applies yet at ${f.late} day${f.late === 1 ? '' : 's'} late (Settings › Electricity)`);
      const r = changeOrRequest(o, 'elecfine', { billId: b.id, pct: f.pct, amount: f.amount, days: f.late }, reason);
      return r.text;
    }, { send: false });
  } catch (e) { err = (e as Error).message; }
  goTo(err ? `${back}?m=elecfine-${encodeURIComponent(billId)}` : back, err || msg);
}
