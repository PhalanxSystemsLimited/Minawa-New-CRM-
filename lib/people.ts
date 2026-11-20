// Customers, employees and flats (21 Nov 2026).
//  · Customer IDs: per building, the building code and a number (CC-00012), given in the order customers were added.
//    Customers from before have theirs from migration 0022 (live); any without one get the next numbers, in the
//    same order, and keep them once something is saved.
//  · Employee IDs: EMP-0001…, for everyone who signs in.
//  · CNIC: 13 digits written 12345-1234567-1, with its expiry (a warning when expired or expiring within a month,
//    never a block) and the address on it.
//  · Flats: every flat a customer has had (from the customer records) and the flats the Admin added in Settings.
//    A flat is empty when nobody has it now; only an empty flat can be picked for a new possession.
import { cur, apartments } from './engine';
import { addDays, diff } from './fmt';
import type { Owner, Staff, ISODate, FlatDef, Plan, Approval } from './types';

/* ---------- customer IDs ---------- */
const numOf = (id: string | null | undefined) => { const m = /(\d+)$/.exec(id || ''); return m ? +m[1] : 0; };
const prefixOf = (project: string) => project.toUpperCase();
export const fmtCustId = (project: string, n: number) => `${prefixOf(project)}-${String(n).padStart(5, '0')}`;
let cache: { owners: Owner[]; n: number; stored: number; map: Map<string, string>; next: number } | null = null;
/** Every customer's ID in this building (stored, or the one they get next time something is saved). */
function custMap() {
  const S = cur(), stored = S.owners.filter(o => o.customerId).length;
  if (cache && cache.owners === S.owners && cache.n === S.owners.length && cache.stored === stored) return cache;
  const map = new Map<string, string>();
  let max = 0;
  for (const o of S.owners) if (o.customerId) { map.set(o.id, o.customerId); max = Math.max(max, numOf(o.customerId)); }
  // S.owners is in creation order (natSort on the record id).
  for (const o of S.owners) if (!o.customerId) map.set(o.id, fmtCustId(S.project, ++max));
  cache = { owners: S.owners, n: S.owners.length, stored, map, next: max + 1 };
  return cache;
}
export const custId = (o: Owner) => o.customerId || custMap().map.get(o.id) || '—';
/** The ID the next new customer here gets. */
export const nextCustId = () => fmtCustId(cur().project, custMap().next);
/** Writes the IDs onto the customers that don't have one stored yet (saved with the change being made). */
export function keepCustIds() { const m = custMap().map; for (const o of cur().owners) if (!o.customerId) o.customerId = m.get(o.id) || null; cache = null; }

/* ---------- employee IDs ---------- */
export const fmtStaffNo = (n: number) => `EMP-${String(n).padStart(4, '0')}`;
/** Everyone's employee ID (stored, or the next numbers in list order). */
export function staffNos(list: Staff[]): { map: Map<string, string>; next: string } {
  const map = new Map<string, string>(); let max = 0;
  for (const s of list) if (s.staffNo) { map.set(s.id, s.staffNo); max = Math.max(max, numOf(s.staffNo)); }
  for (const s of list) if (!s.staffNo) map.set(s.id, fmtStaffNo(++max));
  return { map, next: fmtStaffNo(max + 1) };
}

/* ---------- CNIC ---------- */
/** 12345-1234567-1, or null when it isn't 13 digits. */
export function normCnic(v: string): string | null {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 13 ? `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}` : null;
}
export type CnicState = 'expired' | 'soon' | 'ok' | 'none';
/** Expired, expiring within a month, fine, or no expiry on file. */
export function cnicState(expiry: string | null | undefined, today: ISODate): CnicState {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return 'none';
  return expiry < today ? 'expired' : expiry <= addDays(today, 30) ? 'soon' : 'ok';
}
export const cnicNote = (expiry: string | null | undefined, today: ISODate) => {
  const st = cnicState(expiry, today), n = expiry ? diff(expiry, today) : 0;
  return st === 'expired' ? `CNIC expired ${-n === 0 ? 'today' : `${-n} day${-n === 1 ? '' : 's'} ago`}` : st === 'soon' ? `CNIC expires ${n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`}` : '';
};

/* ---------- apartments (flats) ---------- */
// Every apartment of a building: the ones customers have had (from their records) and the ones the Admin added.
// The Admin's details (block, floor, type, billing plan) are kept in Settings › flats and win over the customer
// records. Apartments carry no dues: what is owed belongs to the customer who had the flat at the time.
export type FlatStatus = 'occupied' | 'booked' | 'vacant' | 'new';
export interface FlatRow { apt: string; block: string; floor: string; type: string; plan: Plan | null; note: string | null; status: FlatStatus; owner: Owner | null; leftOn: ISODate | null; lastName: string | null; added: boolean; def: FlatDef | null; customers: Owner[]; waiting: Approval | null }
export const flatKey = (apt: string) => apt.trim().toUpperCase().replace(/\s+/g, ' ');
const key = flatKey;
/** Every flat in this building. */
export function flatList(): FlatRow[] {
  const S = cur(), out = new Map<string, FlatRow>(), defs = new Map((S.settings.flats || []).map(f => [key(f.apt), f]));
  const byApt = new Map<string, Owner[]>();
  for (const o of S.owners) { const k = key(o.apt); const l = byApt.get(k) || []; l.push(o); byApt.set(k, l); }
  for (const o of apartments()) {
    const k = key(o.apt); if (out.has(k)) continue;
    const d = defs.get(k) || null, list = (byApt.get(k) || []).sort((a, b) => (+(b.status === 'active') - +(a.status === 'active')) || (b.closedOn || b.possession || '').localeCompare(a.closedOn || a.possession || ''));
    const act = list.find(x => x.status === 'active') || null, last = act ? null : list[0];
    out.set(k, { apt: o.apt, block: d?.block || o.block, floor: d?.floor || o.floor || '', type: d?.type || o.type, plan: d?.plan || null, note: d?.note || null, status: act ? 'occupied' : 'vacant', owner: act,
      leftOn: last?.closedOn || null, lastName: last?.name || null, added: !!d, def: d, customers: list, waiting: null });
  }
  for (const [k, f] of defs) {
    if (out.has(k)) continue;
    out.set(k, { apt: f.apt, block: f.block, floor: f.floor, type: f.type, plan: f.plan || null, note: f.note || null, status: 'new', owner: null, leftOn: null, lastName: null, added: true, def: f, customers: [], waiting: null });
  }
  // A possession waiting for the Admin's approval: the flat is booked.
  for (const a of S.approvals) if (a.kind === 'possession' && a.status === 'pending') { const r = out.get(key(String(a.change?.apt || ''))); if (r && r.status !== 'occupied') { r.waiting = a; r.status = 'booked'; } }
  return [...out.values()].sort((a, b) => a.apt.localeCompare(b.apt, 'en', { numeric: true }));
}
/** A possession waiting for the Admin's approval, for this flat. */
export const possessionWaiting = (apt: string) => cur().approvals.find(a => a.kind === 'possession' && a.status === 'pending' && key(String(a.change?.apt || '')) === key(apt)) || null;
/** Free for a new possession: nobody has it, and no possession is waiting for it. */
export const isFree = (f: FlatRow) => f.status === 'vacant' || f.status === 'new';
export const emptyFlats = () => flatList().filter(isFree);
export const flatByApt = (apt: string) => flatList().find(f => key(f.apt) === key(apt)) || null;
export const FLAT_STATUS: Record<FlatStatus, string> = { occupied: 'Possessed', booked: 'Booked', vacant: 'Available', new: 'Available' };

/** "C-301 to C-310", "C-301..C-310", or a list separated by commas or new lines: the flat numbers. */
export function parseFlats(text: string): string[] {
  const out: string[] = [];
  for (const part of String(text || '').split(/[,\n;]+/).map(x => x.trim()).filter(Boolean)) {
    const m = /^(.*?)(\d+)\s*(?:to|\.\.|–)\s*(?:(.*?)(\d+))$/i.exec(part);
    // A range: the same prefix both sides ("C-301 to C-310" or "C-301 to 310"); at most 500 flats at once.
    if (m && (!m[3] || m[3].trim().toUpperCase() === m[1].trim().toUpperCase()) && +m[4] >= +m[2] && +m[4] - +m[2] <= 500) {
      const w = m[2].length;
      for (let n = +m[2]; n <= +m[4]; n++) out.push(`${m[1]}${String(n).padStart(w, '0')}`.toUpperCase().trim());
    } else out.push(part.toUpperCase());
  }
  return [...new Set(out)];
}
