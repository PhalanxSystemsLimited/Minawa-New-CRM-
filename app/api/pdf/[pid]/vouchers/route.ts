// Printed vouchers (20 Nov 2026): the chosen customers' bill vouchers, receipts and statements in one PDF to print.
import { currentStaff } from '@/lib/session';
import { load } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { billDoc, receiptDoc, statementDoc, type DocData } from '@/lib/docdata';
import { voucherDocs } from '@/lib/vouchers';
import { renderPdfMany } from '@/lib/pdf';
import { todayPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: Promise<{ pid: string }> }) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const { pid } = await params, sel = (new URL(req.url).searchParams.get('sel') || '').split(',').filter(Boolean).slice(0, 400);
  const s = await load(pid, staff);
  const docs: DocData[] = use(s, () => voucherDocs(sel).map(x => {
    if (x.kind === 'bill') { const b = s.bills.find(y => y.id === x.id); return b ? billDoc(b) : null; }
    if (x.kind === 'receipt') { const p = s.payments.find(y => y.id === x.id); return p ? receiptDoc(p) : null; }
    const o = ownerById(x.id); return o ? statementDoc(o) : null;
  }).filter((d): d is DocData => !!d));
  if (!docs.length) return new Response('Nothing chosen to print', { status: 404 });
  const pdf = await renderPdfMany(docs, `Printed vouchers ${s.proj.name} ${todayPKT()}`);
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Vouchers-${pid}-${todayPKT()}.pdf"` } });
}
