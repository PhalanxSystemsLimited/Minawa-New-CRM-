// Minawa's bank account for transfers (18 Nov 2026): set by the Admin per building in Settings, printed on bill
// vouchers and in WhatsApp messages. Stored in projects.bank as "Account title · Bank · Account number / IBAN".
export interface Bank { title: string; bank: string; account: string }
export function bankOf(raw: string | null | undefined): Bank | null {
  const p = String(raw || '').split('·').map(x => x.trim());
  if (!p.some(Boolean) || !p[2]) return null;
  return { title: p[0] || '', bank: p[1] || '', account: p[2] || '' };
}
export const bankJoin = (b: Bank) => [b.title, b.bank, b.account].map(x => x.replace(/·/g, '-').trim()).join(' · ');
export const bankLine = (b: Bank) => [b.title, b.bank, `A/C ${b.account}`].filter(Boolean).join(', ');
