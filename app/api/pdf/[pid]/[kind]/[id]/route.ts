// A bill, receipt, statement or clearance certificate as a PDF (the same file WhatsApp sends).
import { currentStaff } from '@/lib/session';
import { load } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { billDoc, receiptDoc, statementDoc, clearanceDoc, historyDoc, aptHistoryDoc, type DocData } from '@/lib/docdata';
import { renderPdf } from '@/lib/pdf';
import { accountDoc, closingDoc } from '@/lib/statements';
import { fillPhotos } from '@/lib/images';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ pid: string; kind: string; id: string }> }) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const { pid, kind, id } = await params, s = await load(pid, staff);
  // Closing statements (26 Nov 2026): a period, ?from=YYYY-MM-DD&to=YYYY-MM-DD (this month to today when not given).
  const u = new URL(req.url), okD = (x: string | null) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);
  const to = okD(u.searchParams.get('to')) ? u.searchParams.get('to')! : s.today, from0 = okD(u.searchParams.get('from')) ? u.searchParams.get('from')! : `${to.slice(0, 7)}-01`, from = from0 > to ? to : from0;
  const d: DocData | null = use(s, () => {
    if (kind === 'bill') { const b = s.bills.find(x => x.id === id); return b ? billDoc(b) : null; }
    if (kind === 'receipt') { const p = s.payments.find(x => x.id === id); return p ? receiptDoc(p) : null; }
    if (kind === 'statement') { const o = ownerById(id); return o ? statementDoc(o) : null; }
    if (kind === 'history') { const o = ownerById(id); return o ? historyDoc(o) : null; }
    if (kind === 'apthistory') { const o = ownerById(id); return o ? aptHistoryDoc(o) : null; }
    if (kind === 'account') { if (staff.role === 'manager') return null; const o = ownerById(id); return o ? accountDoc(o, from, to) : null; }
    if (kind === 'closing') return staff.role === 'manager' ? null : closingDoc(from, to);
    if (kind === 'clearance') { const c = s.clearances.find(x => x.no === id); return c ? clearanceDoc(ownerById(c.ownerId), c) : null; }
    return null;
  });
  if (!d) return new Response('not found', { status: 404 });
  await fillPhotos([d]);
  const pdf = await renderPdf(d);
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${d.filename}"` } });
}
