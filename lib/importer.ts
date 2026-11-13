import { normType } from './defaults';
// Reading an owner list (CSV saved from Excel, or the JSON made by scripts/import_maintenance_xls.py)
// into clean rows, with every problem listed. Pure: runs in the browser for the preview and on the server.

export interface ImportRow {
  apt: string; block: string; type: string; name: string; phone: string; email: string;
  possession: string | null; opening: number; rate: number | null; yearly?: number | null; discount: number; exempt: boolean; director: boolean; notes: string[]; exemptWhy?: string | null; plan: 'monthly' | 'quarterly' | 'annual'; floor?: string;
  line: number;
}
export interface ImportResult { rows: ImportRow[]; problems: { line: number; apt: string; text: string }[]; types: string[]; rates: Record<string, number>; goLive: string | null; source: string }

/** CSV with quotes, commas or semicolons; first row is the header. */
export function parseCsv(text: string): string[][] {
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const out: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter(r => r.some(x => x.trim()));
}

// Column names as Minawa's accountants write them (Country Club, Oakwood, Royal Enclave sheets), lower-cased.
const H: Record<string, string[]> = {
  apt: ['apartment', 'apt', 'apt no', 'apt #', 'apt#', 'flat', 'flat no', 'unit', 'apartment no'], block: ['block', 'tower', 'building'],
  type: ['type', 'apt type', 'apartment type', 'flat type', 'category'],
  name: ['owner', 'owner name', 'name', 'client', 'client name', 'name of client', 'name of clients'], phone: ['whatsapp', 'whatsapp number', 'phone', 'mobile', 'contact', 'cell'], email: ['email', 'e-mail'],
  possession: ['possession', 'possession date', 'date of possession'],
  // What is owed at go-live: either the sheet's balance, or worked out from its columns.
  balance: ['opening balance', 'opening', 'balance', 'balance amount'], arrears: ['arrears', 'arears', 'arrears amount', 'arears amount', 'arrears main.', 'arrears main'],
  yearly: ['maintenance', 'current year', 'jan-26 dec-26 maintenance', 'maintenance jan to dec. 2026', 'year charge'], electricity: ['electricity', 'electricity bills'],
  adjustment: ['adjustment', 'adjustment cost'], received: ['received', 'received amount'], discount: ['discount'],
  rate: ['own rate', 'monthly rate', 'rate'], monthlyDiscount: ['monthly discount'], exempt: ['exempt', 'director', 'hold'], plan: ['plan', 'billing plan', 'billing'], remarks: ['remarks', 'notes', 'note']
};
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function toDate(v: string): string | null {
  const s = String(v || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/); if (m) return iso(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]+(\d{2,4})$/); if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3] < 100 ? 2000 + +m[3] : +m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + +s * 864e5); return d.toISOString().slice(0, 10); } // Excel serial
  return null;
}
function iso(y: number, m: number, d: number) { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? t.toISOString().slice(0, 10) : null; }
const num = (v: string) => { const s = String(v ?? '').replace(/[,\sRs.]/gi, (c) => c === '.' ? '.' : ''); const n = Math.round(+s); return Number.isFinite(n) ? n : NaN; };
const yes = (v: string) => /^(y|yes|true|1|x|exempt|director|hold)$/i.test(String(v || '').trim());
export const normPhone = (v: string) => { let d = String(v || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('0') && d.length === 11) d = '92' + d.slice(1); if (d.length === 10 && d.startsWith('3')) d = '92' + d; return '+' + d; };

export function fromCsv(text: string): ImportResult {
  const rows = parseCsv(text), problems: ImportResult['problems'] = [];
  if (!rows.length) return { rows: [], problems: [{ line: 0, apt: '', text: 'The file is empty.' }], types: [], rates: {}, goLive: null, source: 'CSV' };
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, ' '));
  const col: Record<string, number> = {};
  for (const [k, names] of Object.entries(H)) { const i = head.findIndex(h => names.includes(h)); if (i >= 0) col[k] = i; }
  for (const need of ['apt', 'name']) if (col[need] == null) problems.push({ line: 1, apt: '', text: `No "${H[need][0]}" column. Columns found: ${rows[0].join(', ')}` });
  const out: ImportRow[] = [], seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2, g = (k: string) => col[k] != null ? String(r[col[k]] ?? '').trim() : '';
    const n = (k: string) => { const v = g(k).replace(/^\((.*)\)$/, '-$1'); return v && v !== '-' ? num(v) : 0; };  // (3,000) means -3,000
    let apt = g('apt'); if (!apt) return;
    // Floors as Oakwood writes them: "1 (LGF)". Blocks: add the block when the number doesn't carry it (Oakwood "1 (GF)" in Block A → A-1 (GF)).
    const floor = (apt.match(/\((L?G?F|\d+F|UGF|B\d?)\)/i)?.[1] || '').toUpperCase();
    const block = g('block') || (apt.match(/-([A-Z]{1,2})$/i)?.[1] || apt.match(/^(\d+)-/)?.[1] || apt.split(/[-\s]/)[0]).toUpperCase();
    if (g('block') && !apt.toUpperCase().includes(block)) apt = `${block}-${apt}`;
    if (seen.has(apt.toUpperCase())) { problems.push({ line, apt, text: 'Apartment listed twice; only the first row is used' }); return; }
    seen.add(apt.toUpperCase());
    const notes: string[] = [];
    const phone = normPhone(g('phone')), rawPos = g('possession'), possession = toDate(rawPos.replace(/\(?tfr\)?/i, '').trim());
    if (/tfr/i.test(rawPos)) notes.push('Sheet marks a transfer (Tfr)');
    if (rawPos && !possession) notes.push(`Possession on the sheet: "${rawPos}"`);
    // Opening balance: the sheet's balance if it has one, else arrears + this year's charge + electricity + adjustment − discount − received.
    let opening: number;
    if (col.balance != null && g('balance') !== '') opening = n('balance');
    else opening = n('arrears') + n('yearly') + n('electricity') + n('adjustment') - n('discount') - n('received');
    const parts = (['arrears', 'yearly', 'electricity', 'adjustment', 'discount', 'received'] as const).filter(k => col[k] != null && n(k)).map(k => `${k} ${n(k).toLocaleString('en-US')}`);
    if (parts.length) notes.push(`From the sheet: ${parts.join(', ')}`);
    const typeRaw = g('type'), type = normType(typeRaw) || 'Apartment';
    // Own rate: an explicit monthly rate, or a yearly charge that isn't 12 × the rate card (checked again on import).
    const rate = g('rate') ? num(g('rate')) : NaN, yearly = n('yearly');
    const monthlyDiscount = g('monthlyDiscount') ? num(g('monthlyDiscount')) : n('discount') ? Math.round(n('discount') / 12) : 0;
    if (!g('name')) problems.push({ line, apt, text: 'No owner name' });
    if (!phone) problems.push({ line, apt, text: 'No WhatsApp number: bills can\'t be sent until one is added' });
    else if (phone.replace(/\D/g, '').length < 11) problems.push({ line, apt, text: `WhatsApp number "${g('phone')}" looks too short` });
    if (rawPos && !possession) problems.push({ line, apt, text: `Possession date "${rawPos}" isn't a date (use YYYY-MM-DD or DD/MM/YYYY)` });
    if (!rawPos) problems.push({ line, apt, text: 'No possession date: billed from go-live until one is added' });
    if (Number.isNaN(opening)) problems.push({ line, apt, text: 'The balance isn\'t a number' });
    if (g('remarks')) notes.push(g('remarks'));
    out.push({ apt, block, type, name: g('name'), phone, email: g('email'), possession, opening: Number.isNaN(opening) ? 0 : opening,
      rate: !Number.isNaN(rate) && rate ? rate : null, yearly: yearly || null, discount: Number.isNaN(monthlyDiscount) ? 0 : monthlyDiscount, exempt: yes(g('exempt')), director: /director/i.test(g('exempt')),
      notes, line, floor, plan: /quart/i.test(g('plan')) ? 'quarterly' : /ann|year/i.test(g('plan')) ? 'annual' : 'monthly' });
  });
  const types = [...new Set(out.map(r => r.type))];
  return { rows: out, problems, types, rates: {}, goLive: null, source: 'CSV' };
}

interface ScriptJson { meta: { goLive: string; asOf: string; source: string; rates: { type: string; monthly: number }[] }; owners: { apt: string; block: string; type: string; name: string; possession: string | null; opening: number; hold?: boolean; monthlyDiscount?: number; standardRate?: boolean; rate?: number; notes?: string[] }[] }
export function fromScriptJson(text: string): ImportResult {
  const j = JSON.parse(text) as ScriptJson, problems: ImportResult['problems'] = [];
  const rows: ImportRow[] = j.owners.map((r, i) => {
    if (!r.possession) problems.push({ line: i + 1, apt: r.apt, text: 'No possession date: billed on the 1st until one is added' });
    problems.push({ line: i + 1, apt: r.apt, text: 'No WhatsApp number yet' });
    return { apt: r.apt.replace(/#\d+$/, ''), block: r.block, type: normType(r.type), name: r.name, phone: '', email: '', possession: r.possession, opening: r.opening, rate: r.standardRate ? null : (r.rate || null),
      discount: r.monthlyDiscount || 0, exempt: !!r.hold, director: false, notes: r.notes || [], line: i + 1, plan: 'monthly' as const };
  });
  return { rows, problems, types: [...new Set(rows.map(r => r.type))], rates: Object.fromEntries(j.meta.rates.map(r => [normType(r.type), r.monthly])), goLive: j.meta.goLive, source: j.meta.source };
}
export function parseImport(name: string, text: string): ImportResult {
  return /\.json$/i.test(name) || text.trim().startsWith('{') ? fromScriptJson(text) : fromCsv(text);
}
