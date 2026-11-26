'use server';
// Apartments (21 Nov 2026): only the Admin adds apartments (one, a list, or a range like C-301 to C-310), edits their
// details (block, floor, type, the maintenance billing plan new customers start on) and removes one added by mistake
// while nobody has had it. Building managers and accountants see apartments and start new possessions.
import { redirect } from 'next/navigation';
import { requireAdmin, staffName } from './session';
import { mutate } from './ops';
import { log, at, rateTypes } from './engine';
import { flatList, flatByApt, flatKey, parseFlats } from './people';
import { NEW_PLANS, type Plan, type FlatDef } from './types';

const S = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
/** Back to the page the form came from (only the CRM's own pages), with a message. */
const back = (fdata: FormData, fallback: string, msg: string, hash = ''): never => {
  const b = S(fdata, 'back'), to = /^\/(apartments|p\/|customers)/.test(b) && !b.startsWith('//') ? b : fallback;
  redirect(`${to}${to.includes('?') ? '&' : '?'}t=${encodeURIComponent(msg)}${hash}`);
};
const planOf = (v: string): Plan | null => (NEW_PLANS as string[]).includes(v) ? v as Plan : null;
const APT_RE = /^[A-Z0-9][A-Z0-9 ()/.-]{0,24}$/;

/** Add apartments to a building. */
export async function addAptAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid'), fallback = `/apartments?p=${pid}`;
  let msg = '', err = '';
  try {
    msg = await mutate(pid, staff, s => {
      const list = s.settings.flats = s.settings.flats || [], who = staffName(staff);
      const apts = parseFlats(S(fdata, 'apts')), block = S(fdata, 'block').toUpperCase(), floor = S(fdata, 'floor'), type = S(fdata, 'type'), plan = planOf(S(fdata, 'plan'));
      if (!apts.length) throw new Error('Write the apartment number: one, a list (C-301, C-302) or a range (C-301 to C-310)');
      if (apts.length > 500) throw new Error('Add at most 500 apartments at a time');
      if (!type) throw new Error('Choose the apartment type');
      if (!rateTypes().includes(type)) throw new Error(`${type} has no monthly fee yet: add it in Settings › Monthly fees first`);
      const have = new Set(flatList().map(f => flatKey(f.apt))), added: string[] = [], skipped: string[] = [];
      for (const apt of apts) {
        if (!APT_RE.test(apt)) throw new Error(`"${apt}" doesn't look like an apartment number`);
        if (have.has(flatKey(apt))) { skipped.push(apt); continue; }
        list.push({ apt, block: block || apt.split(/[-\s]/)[0], floor, type, plan, note: S(fdata, 'note') || null, d: s.today, by: who }); have.add(flatKey(apt)); added.push(apt);
      }
      if (added.length) log(s.today, at(15), 'admin', `${added.length} apartment${added.length === 1 ? '' : 's'} added to ${s.proj.name} by ${who} (${type}${plan ? `, ${plan}` : ''}): ${added.slice(0, 20).join(', ')}${added.length > 20 ? '…' : ''}`);
      if (!added.length) throw new Error(`Already there: ${skipped.slice(0, 8).join(', ')}`);
      return `${added.length} apartment${added.length === 1 ? '' : 's'} added${skipped.length ? `; already there: ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? '…' : ''}` : ''}`;
    }, { send: false });
  } catch (e) { err = (e as Error).message; }
  back(fdata, fallback, err ? `Not saved: ${err}` : msg);
}

/** Change an apartment's details. Its number can change only while nobody has ever had it. A new type applies to the
 *  current customer from the next bill (26 Nov 2026; an accountant asks for it with Edit on the customer). */
export async function editAptAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid'), apt = S(fdata, 'apt');
  const fallback = `/apartments/${pid}/${encodeURIComponent(apt)}`;
  let msg = '', err = '', to = fallback;
  try {
    msg = await mutate(pid, staff, s => {
      const f = flatByApt(apt); if (!f) throw new Error(`${apt} isn't one of ${s.proj.name}'s apartments`);
      const list = s.settings.flats = s.settings.flats || [], who = staffName(staff);
      const newApt = (S(fdata, 'newApt') || f.apt).toUpperCase(), block = S(fdata, 'block').toUpperCase(), floor = S(fdata, 'floor'), type = S(fdata, 'type'), plan = planOf(S(fdata, 'plan')), note = S(fdata, 'note') || null;
      if (type && !rateTypes().includes(type)) throw new Error(`${type} has no monthly fee`);
      if (flatKey(newApt) !== flatKey(f.apt)) {
        if (f.customers.length || f.waiting) throw new Error(`${f.apt} has had a customer (or a possession is waiting), so its number stays`);
        if (!APT_RE.test(newApt)) throw new Error(`"${newApt}" doesn't look like an apartment number`);
        if (flatByApt(newApt)) throw new Error(`${newApt} is already an apartment here`);
      }
      const ch: string[] = [];
      if (flatKey(newApt) !== flatKey(f.apt)) ch.push(`number ${f.apt} → ${newApt}`);
      if (block !== f.block) ch.push(`block ${f.block || '—'} → ${block || '—'}`);
      if (floor !== f.floor) ch.push(`floor ${f.floor || '—'} → ${floor || '—'}`);
      if (type && type !== f.type) ch.push(`type ${f.type || '—'} → ${type}`);
      if ((plan || null) !== (f.plan || null)) ch.push(`billing plan ${f.plan || 'not set'} → ${plan || 'not set'}`);
      if ((note || null) !== (f.note || null)) ch.push('note changed');
      if (!ch.length) return 'Nothing changed';
      const def: FlatDef = { ...(f.def || { d: s.today, by: who }), apt: newApt, block, floor, type: type || f.type, plan, note, editedBy: who, editedD: s.today };
      const i = list.findIndex(x => flatKey(x.apt) === flatKey(f.apt));
      if (i >= 0) list[i] = def; else list.push(def);
      // 26 Nov 2026: the customer in it is billed by the apartment's type from the next bill.
      const o = f.owner, newType = type && type !== f.type && o && o.type !== type ? type : '';
      if (newType && o) { const was = o.type; o.type = newType; o.notes.push({ d: s.today, by: who, text: `Apartment type changed by ${who}: ${was || 'not set'} → ${newType}, from the next bill. Bills already made don't change.` }); }
      log(s.today, at(15), 'admin', `Apartment ${f.apt} (${s.proj.name}) edited by ${who}: ${ch.join('; ')}`, f.owner?.id || null);
      to = `/apartments/${pid}/${encodeURIComponent(newApt)}`;
      return `${newApt} saved${newType && o ? `. ${o.name} is billed as ${newType} from the next bill${o.rate ? ' (own monthly fee stays)' : ''}` : ''}`;
    }, { send: false });
  } catch (e) { err = (e as Error).message; }
  redirect(`${err ? fallback + '?m=editapt&' : to + '?'}t=${encodeURIComponent(err ? `Not saved: ${err}` : msg)}`);
}

/** Remove an apartment added by mistake (nobody has ever had it). */
export async function removeAptAction(fdata: FormData) {
  const staff = await requireAdmin(), pid = S(fdata, 'pid'), apt = S(fdata, 'apt');
  let msg = '', err = '';
  try {
    msg = await mutate(pid, staff, s => {
      const f = flatByApt(apt); if (!f) throw new Error(`${apt} isn't on the list`);
      if (f.customers.length) throw new Error(`${f.apt} has had a customer, so it stays (with their history)`);
      if (f.waiting) throw new Error(`A possession of ${f.apt} is waiting for approval`);
      const list = s.settings.flats || [], i = list.findIndex(x => flatKey(x.apt) === flatKey(f.apt));
      if (i < 0) throw new Error(`${f.apt} can't be removed`);
      list.splice(i, 1);
      log(s.today, at(15), 'admin', `Apartment ${f.apt} removed from ${s.proj.name} by ${staffName(staff)}`);
      return `${f.apt} removed`;
    }, { send: false });
  } catch (e) { err = (e as Error).message; }
  if (err) redirect(`/apartments/${pid}/${encodeURIComponent(apt)}?t=${encodeURIComponent(`Not removed: ${err}`)}`);
  redirect(`/apartments?p=${pid}&t=${encodeURIComponent(msg)}`);
}
