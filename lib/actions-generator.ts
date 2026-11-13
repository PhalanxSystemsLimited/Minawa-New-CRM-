'use server';
// Generator Charges List: put flats on or off it (admins and accountants). A flat on the list is billed on the
// "<type> + generator" rate card (Royal Enclave: 15,000 a month instead of 12,000). Bills already made keep their
// amount, so a change only counts from the next month not yet billed.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireStaff, staffName } from './session';
import { mutate } from './ops';
import { ownerById, hasGenerator, nextPeriodFor, rateOf, billDateOf, log, at } from './engine';
import { fm, rs } from './fmt';

export interface GeneratorResult { ok: boolean; changed: number; error?: string }

export async function setGeneratorAction(input: { pid: string; ids: string[]; on: boolean }): Promise<GeneratorResult> {
  const staff = await requireStaff(), on = !!input.on, ids = [...new Set((input.ids || []).map(String))];
  if (!ids.length) return { ok: false, changed: 0, error: 'Tick at least one apartment.' };
  try {
    const changed = await mutate(input.pid, staff, s => {
      if (!hasGenerator()) throw new Error(`${s.proj.name} has no generator rate card.`);
      const who = staffName(staff), done: string[] = [];
      for (const id of ids) {
        const o = ownerById(id);
        if (!o || o.status !== 'active' || !!o.generator === on) continue;
        o.generator = on;
        const p = nextPeriodFor(o), fee = rateOf(o, billDateOf(p));
        const text = `${on ? 'Added to' : 'Removed from'} the Generator Charges List by ${who}: ${rs(fee)} a month from the ${fm(p)} bill${o.rate ? ` (the flat's own rate of ${rs(o.rate)} still applies)` : ''}. Bills already made don't change.`;
        o.notes.push({ d: s.today, by: who, text });
        log(s.today, at(15), 'admin', `${o.apt}: ${text}`, o.id);
        done.push(o.apt);
      }
      return done.length;
    }, { send: false });
    revalidatePath(`/p/${input.pid}/generator`);
    return { ok: true, changed };
  } catch (e) { return { ok: false, changed: 0, error: (e as Error).message }; }
}

/** The same for one flat, from its page (a form). */
export async function toggleGeneratorAction(fdata: FormData) {
  const pid = String(fdata.get('pid') || ''), oid = String(fdata.get('oid') || ''), on = fdata.get('on') === '1';
  const r = await setGeneratorAction({ pid, ids: [oid], on });
  const t = r.ok ? (r.changed ? (on ? 'Added to the Generator Charges List' : 'Removed from the Generator Charges List') + '; it counts from the next bill' : 'No change') : r.error || 'Not saved';
  redirect(`/p/${pid}/apartments/${oid}?t=${encodeURIComponent(t)}`);
}
