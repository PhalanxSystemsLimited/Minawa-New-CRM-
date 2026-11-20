// Excel downloads (update 123): every "Download" in the CRM gives a real Excel workbook (.xlsx) instead of a plain
// CSV, so it opens styled: a bold title, bold white column names on a dark band, money with thousands separators,
// real dates, light striping, a bold totals row, sensible column widths, the header row frozen and filters on (when
// the sheet is one table), and landscape printing that fits the page width.
// No library: a workbook is a zip of a few XML files, written here with node's zlib. `readXlsx` reads the first sheet
// of a workbook back (the utility sheet is filled in Excel and imported again). Server only.
import zlib from 'node:zlib';

export type Kind = 'text' | 'money' | 'int' | 'date' | 'datetime' | 'pct';
export type Val = string | number | boolean | null | undefined;
type Row = { t: 'title' | 'note' | 'section' | 'blank' | 'head' | 'data' | 'total'; v: Val[]; k?: Kind[]; z?: number };

/** One worksheet, written top to bottom: a title, notes, section headings and tables. */
export class Sheet {
  rows: Row[] = [];
  private kinds: Kind[] = [];
  private zebra = 0;
  constructor(public name: string) {}
  title(t: string) { this.rows.push({ t: 'title', v: [t] }); return this; }
  note(t: string) { this.rows.push({ t: 'note', v: [t] }); return this; }
  blank() { this.rows.push({ t: 'blank', v: [] }); return this; }
  section(t: string) { if (this.rows.length && this.rows[this.rows.length - 1].t !== 'blank') this.blank(); this.rows.push({ t: 'section', v: [t] }); return this; }
  /** Starts a table: its column names and what each column holds (text when not given). */
  head(cols: (string | [string, Kind])[]) {
    this.kinds = cols.map(c => Array.isArray(c) ? c[1] : 'text'); this.zebra = 0;
    this.rows.push({ t: 'head', v: cols.map(c => Array.isArray(c) ? c[0] : c), k: this.kinds.map(() => 'text') });
    return this;
  }
  row(v: Val[]) { this.rows.push({ t: 'data', v, k: this.kinds, z: this.zebra++ % 2 }); return this; }
  total(v: Val[]) { this.rows.push({ t: 'total', v, k: this.kinds }); return this; }
}

/* ---------- styles ---------- */
const KINDS: Kind[] = ['text', 'money', 'date', 'pct', 'datetime'];
const kIdx = (k: Kind) => k === 'int' ? 1 : KINDS.indexOf(k);
const FMT = [0, 164, 165, 9, 166];                      // General, #,##0, dd mmm yyyy, 0%, date and time
const S_TITLE = 1, S_NOTE = 2, S_SECTION = 3, S_HEAD = 4, S_BODY = 5, S_TOTAL = S_BODY + KINDS.length * 2;
const bodyStyle = (k: Kind, z: number) => S_BODY + kIdx(k) * 2 + z;
const totalStyle = (k: Kind) => S_TOTAL + kIdx(k);

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="dd mmm yyyy"/><numFmt numFmtId="166" formatCode="dd mmm yyyy h:mm AM/PM"/></numFmts>
<fonts count="6">
<font><sz val="11"/><color rgb="FF1F2328"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF111111"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="15"/><color rgb="FF0B0B0C"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="12"/><color rgb="FFB4552B"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF6F4F1"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF3E6DC"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFE3E0DB"/></left><right style="thin"><color rgb="FFE3E0DB"/></right><top style="thin"><color rgb="FFE3E0DB"/></top><bottom style="thin"><color rgb="FFE3E0DB"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FF1F2937"/></left><right style="thin"><color rgb="FF1F2937"/></right><top style="thin"><color rgb="FF1F2937"/></top><bottom style="thin"><color rgb="FF1F2937"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FFE3E0DB"/></left><right style="thin"><color rgb="FFE3E0DB"/></right><top style="medium"><color rgb="FFB4552B"/></top><bottom style="thin"><color rgb="FFB4552B"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${S_TOTAL + KINDS.length}">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="5" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" horizontal="left" indent="1" wrapText="1"/></xf>
${KINDS.flatMap((k, i) => [0, 1].map(z => `<xf numFmtId="${FMT[i]}" fontId="0" fillId="${z ? 3 : 0}" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" indent="1"${k === 'text' ? ' horizontal="left"' : ' horizontal="right"'}/></xf>`)).join('\n')}
${KINDS.map((k, i) => `<xf numFmtId="${FMT[i]}" fontId="1" fillId="4" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" indent="1"${k === 'text' ? ' horizontal="left"' : ' horizontal="right"'}/></xf>`).join('\n')}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/* ---------- cells ---------- */
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i: number) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const EPOCH = Date.UTC(1899, 11, 30);
/** A date (YYYY-MM-DD) or a moment (ISO, shown in Pakistan time) as an Excel date number; null when it isn't one. */
function serial(v: string, withTime: boolean): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(v); if (!m) return null;
  let ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (m[4] && /(Z|[+-]\d{2}:?\d{2})$/.test(v)) { const t = Date.parse(v); if (Number.isFinite(t)) ms = t + 5 * 3600e3; }
  const d = (ms - EPOCH) / 86400e3;
  return withTime ? Math.round(d * 1440) / 1440 : Math.floor(d);
}
function cell(ref: string, v: Val, kind: Kind, s: number): string {
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
  if (typeof v === 'boolean') v = v ? 'Yes' : 'No';
  if (kind === 'money' || kind === 'int' || kind === 'pct') {
    const n = typeof v === 'number' ? v : /^-?[\d,]+(\.\d+)?%?$/.test(v.trim()) ? +v.replace(/[,%]/g, '') / (v.trim().endsWith('%') ? 100 : 1) : NaN;
    if (Number.isFinite(n)) return `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
  } else if ((kind === 'date' || kind === 'datetime') && typeof v === 'string') {
    const n = serial(v, kind === 'datetime'); if (n !== null) return `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
  } else if (typeof v === 'number') return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}
/** How wide a value shows (characters), to size the columns. */
function shown(v: Val, kind: Kind) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return (kind === 'money' || kind === 'int' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v)).length + 1;
  if (kind === 'date' && serial(String(v), false) !== null) return 11;
  if (kind === 'datetime' && serial(String(v), true) !== null) return 20;
  return Math.max(...String(v).split('\n').map(l => l.length));
}

function sheetXml(sh: Sheet) {
  const widths: number[] = [], heads = sh.rows.filter(r => r.t === 'head');
  for (const r of sh.rows) if (r.t === 'head' || r.t === 'data' || r.t === 'total') r.v.forEach((v, i) => { widths[i] = Math.max(widths[i] || 0, shown(v, r.t === 'head' ? 'text' : r.k?.[i] || 'text') * (r.t === 'head' ? 1.1 : 1)); });
  const n = Math.max(1, widths.length);
  const cols = Array.from({ length: n }, (_, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(9, Math.ceil((widths[i] || 8) + 4)))}" customWidth="1"/>`).join('');
  // One table only: freeze its header row and turn the filters on.
  const one = heads.length === 1, hi = one ? sh.rows.indexOf(heads[0]) : -1;
  const last = one ? sh.rows.reduce((a, r, i) => r.t === 'data' ? i : a, hi) : -1;
  const body = sh.rows.map((r, i) => {
    const R = i + 1;
    if (r.t === 'blank') return `<row r="${R}"/>`;
    if (r.t === 'title' || r.t === 'note' || r.t === 'section') return `<row r="${R}"${r.t === 'title' ? ' ht="24" customHeight="1"' : r.t === 'section' ? ' ht="20" customHeight="1"' : ''}>${cell(`A${R}`, r.v[0], 'text', r.t === 'title' ? S_TITLE : r.t === 'note' ? S_NOTE : S_SECTION)}</row>`;
    const len = r.t === 'head' ? r.v.length : Math.max(r.v.length, r.k?.length || 0);
    const cs = Array.from({ length: len }, (_, j) => {
      const k = r.k?.[j] || 'text';
      return cell(col(j) + R, r.v[j], k, r.t === 'head' ? S_HEAD : r.t === 'total' ? totalStyle(k) : bodyStyle(k, r.z || 0));
    }).join('');
    return `<row r="${R}"${r.t === 'head' ? ' ht="22" customHeight="1"' : ''}>${cs}</row>`;
  }).join('');
  const pane = one && hi >= 0 ? `<pane ySplit="${hi + 1}" topLeftCell="A${hi + 2}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${hi + 2}" sqref="A${hi + 2}"/>` : '';
  const filter = one && last > hi ? `<autoFilter ref="A${hi + 1}:${col(heads[0].v.length - 1)}${last + 1}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols>${cols}</cols><sheetData>${body}</sheetData>${filter}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const sheetName = (s: string, used: Set<string>) => { let n = s.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'; for (let i = 2; used.has(n.toLowerCase()); i++) n = `${n.slice(0, 28)} ${i}`; used.add(n.toLowerCase()); return n; };

/** The workbook's bytes. */
export function xlsx(sheets: Sheet | Sheet[]): Uint8Array {
  const list = Array.isArray(sheets) ? sheets : [sheets], used = new Set<string>(), names = list.map(s => sheetName(s.name, used));
  const files: [string, string][] = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(names[0])}</dc:title><dc:creator>Minawa CRM</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${list.map((s, i) => { const h = s.rows.filter(r => r.t === 'head'); if (h.length !== 1) return ''; const hi = s.rows.indexOf(h[0]), last = s.rows.reduce((a, r, j) => r.t === 'data' ? j : a, hi); return last > hi ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i]).replace(/'/g, "''")}'!$A$${hi + 1}:$${col(h[0].v.length - 1)}$${last + 1}</definedName></definedNames>` : ''; }).find(Boolean) || ''}</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...list.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)] as [string, string]),
  ];
  return zip(files.map(([n, t]) => [n, Buffer.from(t, 'utf8')]));
}

/** The download response. `file` without the extension. */
export function xlsxResponse(sheets: Sheet | Sheet[], file: string) {
  const name = file.replace(/[^\w.-]+/g, '_') + '.xlsx';
  return new Response(Buffer.from(xlsx(sheets)), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
}

/* ---------- zip ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files: [string, Buffer][]): Uint8Array {
  const parts: Buffer[] = [], central: Buffer[] = [];
  const now = new Date(), dt = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff, dd = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
  let off = 0;
  for (const [name, data] of files) {
    const nm = Buffer.from(name, 'utf8'), comp = zlib.deflateRawSync(data, { level: 6 }), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(dt, 10); lh.writeUInt16LE(dd, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26); lh.writeUInt16LE(0, 28);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(dt, 12); ch.writeUInt16LE(dd, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nm, comp); central.push(ch, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}
function unzip(b: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength), out = new Map<string, Buffer>();
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('This file isn\'t an Excel workbook (.xlsx).');
  let p = buf.readUInt32LE(e + 16); const n = buf.readUInt16LE(e + 10);
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl), ds = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), raw = buf.subarray(ds, ds + csize);
    if (method === 0 || method === 8) out.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nl + xl + cl;
  }
  return out;
}

const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&amp;/g, '&');
const texts = (x: string) => [...x.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m => unesc(m[1])).join('');
/** The first sheet of an .xlsx as rows of text (what Excel shows, before number formats). */
export function readXlsx(b: Uint8Array): string[][] {
  const f = unzip(b), get = (n: string) => f.get(n)?.toString('utf8') || '';
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m => texts(m[1]));
  // The first sheet in the workbook's order.
  const wb = get('xl/workbook.xml'), rid = /<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  const target = rid ? new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(get('xl/_rels/workbook.xml.rels'))?.[1] || new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(get('xl/_rels/workbook.xml.rels'))?.[1] : null;
  const path = target ? (target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '')) : [...f.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
  const xml = get(path || ''); if (!xml) throw new Error('The workbook has no sheet to read.');
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
    const ri = +(/\br="(\d+)"/.exec(r[1])?.[1] || rows.length + 1) - 1, line: string[] = [];
    let next = 0;
    for (const c of (r[2] || '').matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const ref = /\br="([A-Z]+)\d*"/.exec(c[1])?.[1], t = /\bt="(\w+)"/.exec(c[1])?.[1] || '', inner = c[2] || '';
      const ci = ref ? [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : next;
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner)?.[1];
      line[ci] = t === 's' ? shared[+(v || 0)] ?? '' : t === 'inlineStr' ? texts(inner) : v !== undefined ? unesc(v) : '';
      next = ci + 1;
    }
    rows[ri] = Array.from(line, x => x ?? '');
  }
  return Array.from(rows, x => x ?? []);
}
