'use server';
// Photos on bills and payment entries, and electricity reminders (21 Nov 2026). The photo itself is uploaded first
// (/api/upload); these save which photo belongs to which bill or entry.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole, requireStaff, staffName } from './session';
import { mutate } from './ops';
import { getStore } from './store';
import { ownerById, log, elecReminder, isUtilBill, utilKind, periodLabel } from './engine';
import { nowPKT } from './fmt';

/** The photo with this id, if it was uploaded for this building (and kind). Throws a message for the form. */
export async function photoFor(id: string, pid: string, kind: 'payment' | 'bill') {
  if (!id) return null;
  const r = /^IMG[A-Za-z0-9_-]{6,30}$/.test(id) ? await (await getStore()).getImage(id) : null;
  if (!r || r.project !== pid || r.kind !== kind) throw new Error('The photo wasn\'t found. Add it again.');
  return r;
}

/** The building manager's photo of an electricity bill: printed on the bill PDF the customer gets. */
export async function attachBillPhotoAction(input: { pid: string; billId: string; imageId: string }): Promise<{ ok: boolean; error?: string }> {
  try {
    const staff = await requireRole('manager', 'admin');
    await photoFor(input.imageId, input.pid, 'bill');
    await mutate(input.pid, staff, s => {
      const b = s.bills.find(x => x.id === input.billId);
      if (!b || !isUtilBill(b)) throw new Error('This electricity bill isn\'t there any more.');
      const o = ownerById(b.ownerId), had = !!b.photoId;
      b.photoId = input.imageId;
      log(s.today, nowPKT(), 'message', `${had ? 'New photo' : 'Photo'} of the ${utilKind(b).toLowerCase()} bill for ${o.apt} (${periodLabel(b)}) added by ${staffName(staff)}`, o.id);
    }, { send: false });
    await (await getStore()).linkImage(input.imageId, input.billId);
    revalidatePath(`/p/${input.pid}/electricity`);
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

/** "Send reminder" on unpaid electricity bills: queues one reminder per bill, then opens Send on WhatsApp for them. */
export async function elecReminderAction(fdata: FormData) {
  const staff = await requireStaff(), pid = String(fdata.get('pid') || ''), ids = String(fdata.get('ids') || '').split(',').filter(Boolean).slice(0, 500);
  const back = `/p/${pid}/electricity`;
  if (staff.role !== 'manager') redirect(`${back}?flash=${encodeURIComponent('Reminders are sent by the building manager.')}`);
  const owners = await mutate(pid, staff, s => {
    const t = nowPKT(), out = new Set<string>();
    for (const id of ids) { const b = s.bills.find(x => x.id === id); if (b && isUtilBill(b)) { const o = ownerById(b.ownerId); if (o && o.status === 'active' && elecReminder(o, b, s.today, t)) out.add(o.id); } }
    if (out.size) log(s.today, t, 'message', `${staffName(staff)} prepared ${out.size} electricity bill reminder${out.size === 1 ? '' : 's'}`);
    return [...out];
  }, { send: false });
  if (!owners.length) redirect(`${back}?flash=${encodeURIComponent('Nothing to remind: these bills are paid, or their reminder is already waiting to be sent.')}`);
  redirect(`/p/${pid}/send?type=queue&kind=reminder&ids=${encodeURIComponent(owners.join(','))}&go=1`);
}
