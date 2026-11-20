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
  if (!amount) goTo(again, 'Enter the bill amount (Rs)');
  if (units == null) goTo(again, 'Enter the units on the bill');
  if (reading == null) goTo(again, 'Enter the meter reading on the bill');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) goTo(again, 'Pick the due date');
  let err = '', msg = '';
  try {
    msg = await mutate(pid, staff, s => {
      const b = s.bills.find(x => x.id === billId);
      if (!b || !isUtilBill(b)) throw new Error('This electricity bill isn\'t there any more');
      const why = elecLocked(b); if (why) throw new Error(`It can't be changed: ${why.toLowerCase()}`);
      const o = ownerById(b.ownerId), chs = s.charges.filter(c => c.billId === b.id && c.kind === KIND);
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
