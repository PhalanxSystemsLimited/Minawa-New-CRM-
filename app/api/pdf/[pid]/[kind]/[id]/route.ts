// A bill, receipt, statement or clearance certificate as a PDF (the same file WhatsApp sends).
import { currentStaff } from '@/lib/session';
import { load } from '@/lib/ops';
import { use, ownerById, activeLink } from '@/lib/engine';
import { billDoc, receiptDoc, statementDoc, clearanceDoc, type DocData } from '@/lib/docdata';
import { renderPdf } from '@/lib/pdf';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ pid: string; kind: string; id: string }> }) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const { pid, kind, id } = await params, s = await load(pid, staff);
  const d: DocData | null = use(s, () => {
    if (kind === 'bill') { const b = s.bills.find(x => x.id === id); return b ? billDoc(b) : null; }
    if (kind === 'receipt') { const p = s.payments.find(x => x.id === id); return p ? receiptDoc(p) : null; }
    if (kind === 'statement') { const o = ownerById(id); return o ? statementDoc(o, activeLink(o)) : null; }
    if (kind === 'clearance') { const c = s.clearances.find(x => x.no === id); return c ? clearanceDoc(ownerById(c.ownerId), c) : null; }
    return null;
  });
  if (!d) return new Response('not found', { status: 404 });
  const pdf = await renderPdf(d);
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${d.filename}"` } });
}
