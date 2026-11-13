'use server';
// Generator Charges List: put flats on or off it. A flat on the list is billed on the "<type> + generator" rate card
// (Royal Enclave: 15,000 a month instead of 12,000). Bills already made keep their amount, so a change only counts
// from the next month not yet billed. An admin's change applies at once; an accountant's waits for an admin's approval.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff } from './session';
import { mutate } from './ops';
import { ownerById, hasGenerator } from './engine';
import { changeOrRequest } from './approvals';

export interface GeneratorResult { ok: boolean; changed: number; requested: number; error?: string }

export async function setGeneratorAction(input: { pid: string; ids: string[]; on: boolean }): Promise<GeneratorResult> {
  const staff = await requireStaff(), on = !!input.on, ids = [...new Set((input.ids || []).map(String))];
  if (!ids.length) return { ok: false, changed: 0, requested: 0, error: 'Tick at least one apartment.' };
  try {
    const out = await mutate(input.pid, staff, s => {
      if (!hasGenerator()) throw new Error(`${s.proj.name} has no generator rate card.`);
      let changed = 0, requested = 0;
      for (const id of ids) {
        const o = ownerById(id);
        if (!o || o.status !== 'active') continue;
        const r = changeOrRequest(o, 'generator', { on });
        if (r.done === 'applied') changed++; else if (r.done === 'requested') requested++;
      }
      return { changed, requested };
    }, { send: false });
    revalidatePath(`/p/${input.pid}/generator`);
    return { ok: true, ...out };
  } catch (e) { return { ok: false, changed: 0, requested: 0, error: (e as Error).message }; }
}

/** The same for one flat, from its page (a form). */
export async function toggleGeneratorAction(fdata: FormData) {
  const pid = String(fdata.get('pid') || ''), oid = String(fdata.get('oid') || ''), on = fdata.get('on') === '1';
  const r = await setGeneratorAction({ pid, ids: [oid], on });
  const t = !r.ok ? r.error || 'Not saved' : r.requested ? `Sent to an admin for approval: ${on ? 'add to' : 'remove from'} the Generator Charges List. It applies once approved.`
    : r.changed ? (on ? 'Added to the Generator Charges List' : 'Removed from the Generator Charges List') + '; it counts from the next bill' : 'No change';
  redirect(`/p/${pid}/apartments/${oid}?t=${encodeURIComponent(t)}`);
}
