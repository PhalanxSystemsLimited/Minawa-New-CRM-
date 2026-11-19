// A customer's bill voucher or receipt as a PDF, from the link in their WhatsApp message (no sign-in: the link is
// signed, see lib/doclink.ts). A voucher always shows today's figures.
import { readDocToken } from '@/lib/doclink';
import { load } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { billDoc, receiptDoc, statementDoc, type DocData } from '@/lib/docdata';
import { renderPdf } from '@/lib/pdf';
import { fillPhotos } from '@/lib/images';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = readDocToken((await params).token);
  if (!t) return new Response('This link is not valid. Please ask Minawa Group for a new one.', { status: 404 });
  try {
    const s = await load(t.pid, null);
    const d: DocData | null = use(s, () => {
      if (t.kind === 'bill') { const b = s.bills.find(x => x.id === t.id); return b ? billDoc(b) : null; }
      if (t.kind === 'receipt') { const p = s.payments.find(x => x.id === t.id); return p ? receiptDoc(p) : null; }
      const o = ownerById(t.id); return o ? statementDoc(o) : null;
    });
    if (!d) return new Response('This document is no longer available. Please ask Minawa Group for a new one.', { status: 404 });
    await fillPhotos([d]);
    const pdf = await renderPdf(d);
    return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${d.filename}"`, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  } catch {
    return new Response('This document is not available right now. Please try again later.', { status: 500 });
  }
}
