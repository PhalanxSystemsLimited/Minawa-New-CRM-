// Printed vouchers (20 Nov 2026): customers without WhatsApp (no number, or a number not on WhatsApp) get their bill,
// late warning or receipt on paper. Every message the CRM couldn't send them waits here; the building manager prints
// the vouchers in one PDF, delivers them by hand and marks them delivered. Call inside use(state, …).
import type { Message, Owner } from './types';
import { cur, ownerById, balance, aptOrder, periodLabel } from './engine';

export interface VoucherItem { msg: Message; what: string; pdf: { kind: 'bill' | 'receipt' | 'statement'; id: string }; /** Every waiting message this paper covers (marked delivered together). */ ids: string[] }
export interface VoucherRow { o: Owner; why: string; items: VoucherItem[]; bal: number }

export const DUES = ['bill', 'reminder', 'notice', 'link', 'statement', 'receipt'];

/** What a message becomes on paper: its own PDF (bill voucher, receipt) or the customer's statement of dues. */
function paperOf(m: Message, o: Owner): VoucherItem {
  const S = cur();
  if (m.pdf?.kind === 'receipt') { const p = S.payments.find(x => x.id === m.pdf!.id); return { msg: m, what: `Receipt ${p?.receipt || ''}`.trim(), pdf: { kind: 'receipt', id: m.pdf.id }, ids: [] }; }
  if (m.pdf?.kind === 'bill') { const b = S.bills.find(x => x.id === m.pdf!.id); if (b) return { msg: m, what: `${m.kind === 'notice' ? 'Late warning: ' : ''}Bill ${periodLabel(b)}`, pdf: { kind: 'bill', id: b.id }, ids: [] }; }
  return { msg: m, what: m.kind === 'notice' ? 'Late warning: statement of dues' : m.kind === 'reminder' ? 'Reminder: statement of dues' : 'Statement of dues', pdf: { kind: 'statement', id: o.id }, ids: [] };
}

/** Everyone without WhatsApp, with what is waiting to be delivered to them (newest messages only, one per document). */
export function voucherRows(): VoucherRow[] {
  const S = cur(), by = new Map<string, Message[]>();
  for (const m of S.messages) if (m.status === 'failed' && m.from === 'biz' && DUES.includes(m.kind)) by.set(m.ownerId, [...(by.get(m.ownerId) || []), m]);
  return S.owners.filter(o => o.status === 'active' && o.invalidPhone).sort(aptOrder).map(o => {
    const seen = new Map<string, VoucherItem>(), items: VoucherItem[] = [];
    for (const m of [...(by.get(o.id) || [])].reverse()) {   // newest first: one paper per document
      const it = paperOf(m, o), k = `${it.pdf.kind}:${it.pdf.id}`, had = seen.get(k);
      if (had) { had.ids.push(m.id); continue; }
      it.ids.push(m.id); seen.set(k, it); items.push(it);
    }
    return { o, why: o.noPhone ? 'No WhatsApp number' : 'Number not on WhatsApp', items, bal: balance(o) };
  });
}

/** The messages behind a selection ("m:<id>" one waiting message, "o:<owner id>" a statement only). */
export function voucherDocs(sel: string[]) {
  const S = cur(), out: { kind: 'bill' | 'receipt' | 'statement'; id: string }[] = [], seen = new Set<string>();
  for (const x of sel) {
    let d: { kind: 'bill' | 'receipt' | 'statement'; id: string } | null = null;
    if (x.startsWith('m:')) { const m = S.messages.find(y => y.id === x.slice(2)); const o = m && ownerById(m.ownerId); if (m && o) d = paperOf(m, o).pdf; }
    else if (x.startsWith('o:')) { const o = ownerById(x.slice(2)); if (o) d = { kind: 'statement', id: o.id }; }
    if (d && !seen.has(`${d.kind}:${d.id}`)) { seen.add(`${d.kind}:${d.id}`); out.push(d); }
  }
  return out;
}
