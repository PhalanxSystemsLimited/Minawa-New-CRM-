// WhatsApp numbers staff send from, and the daily limit (20 Nov 2026). The Admin adds each person's numbers in Staff &
// connections (personal and/or company), each with its own daily limit (default 125: half of the 250 new customers a day
// Meta publishes for its Business Platform). The limit counts different customers in any 24 hours, per number; a
// customer messaged again within the 24 hours is free. A chat counts when "Open chat" is pressed. No email is sent by
// this system: WhatsApp (and printed vouchers for customers without it) are the only ways bills reach customers.
import type { Staff, WaNumber } from './types';

export const DEFAULT_LIMIT = 125;
export const MAX_LIMIT = 1000;
export const MAX_NUMBERS = 4;

/** Digits only, in the international form WhatsApp uses: 0300 1234567 → 923001234567. */
export function normNumber(s: string) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 11) d = '92' + d.slice(1);
  return d;
}
export const validNumber = (d: string) => d.length >= 10 && d.length <= 15;

/** +92 300 1234567 (Pakistan), or +<digits>. */
export function fmtNumber(d: string) {
  return d.startsWith('92') && d.length === 12 ? `+92 ${d.slice(2, 5)} ${d.slice(5)}` : `+${d}`;
}

/** The person's numbers they can send from now. */
export const activeNumbers = (s: Staff | null | undefined) => (s?.waNumbers || []).filter(n => n.active && validNumber(n.number));

/** The number to send from: the one asked for if it is the person's and switched on, else their first active one. */
export function pickNumber(s: Staff | null | undefined, wanted?: string | null): WaNumber | null {
  const list = activeNumbers(s);
  return list.find(n => n.number === normNumber(wanted || '')) || list[0] || null;
}

/** The numbers from the staff form (a JSON list), checked. Throws a message for the Admin when something is wrong. */
export function parseNumbers(raw: string, keep: WaNumber[] = []): WaNumber[] {
  let list: unknown;
  try { list = JSON.parse(raw || '[]'); } catch { throw new Error('The WhatsApp numbers could not be read. Try again.'); }
  if (!Array.isArray(list)) return [];
  const out: WaNumber[] = [], seen = new Set<string>();
  for (const x of list.slice(0, MAX_NUMBERS) as Record<string, unknown>[]) {
    const number = normNumber(String(x.number || ''));
    if (!number) continue;
    if (!validNumber(number)) throw new Error(`${String(x.number)} isn't a full WhatsApp number. Include the country code, e.g. +92 300 1234567.`);
    if (seen.has(number)) throw new Error(`${fmtNumber(number)} is entered twice.`);
    seen.add(number);
    const limit = Math.round(Number(x.limit));
    if (!(limit >= 1 && limit <= MAX_LIMIT)) throw new Error(`The daily limit for ${fmtNumber(number)} must be between 1 and ${MAX_LIMIT}.`);
    const id = String(x.id || '') || keep.find(k => k.number === number)?.id || 'N' + Math.random().toString(36).slice(2, 9);
    out.push({ id, number, label: x.label === 'Company' ? 'Company' : 'Personal', limit, active: x.active !== false });
  }
  return out;
}

/** "2:40 PM" (Pakistan time) for when the next place frees up. */
export function freeAt(iso: string | null | undefined) {
  if (!iso) return '';
  const t = new Date(new Date(iso).getTime() + 5 * 3600e3);
  const h = t.getUTCHours(), m = t.getUTCMinutes();
  const day = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10) === t.toISOString().slice(0, 10) ? '' : ' tomorrow';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}${day}`;
}
