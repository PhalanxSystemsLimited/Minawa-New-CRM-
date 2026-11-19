// A customer's bill voucher or receipt as a PDF, from the link in their WhatsApp message (no sign-in: the link is
// signed, see lib/doclink.ts). A voucher always shows today's figures.
import { readDocToken } from '@/lib/doclink';
import { load } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { billDoc, receiptDoc, statementDoc, type DocData } from '@/lib/docdata';
import { renderPdf } from '@/lib/pdf';
import { fillPhotos } from '@/lib/images';

export const dynamic = 'force-dynamic';

/** A small page for a link that can't be opened (no names or amounts on it). */
function page(title: string, text: string, status: number) {
  const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Minawa Group</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f1ec;color:#1f2328}main{max-width:420px;margin:24px;padding:28px;border-radius:18px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.08);text-align:center}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#57606a}b{color:#c2410c}</style></head>
<body><main><p><b>Minawa Group</b></p><h1>${esc(title)}</h1><p>${esc(text)}</p></main></body></html>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const t = readDocToken((await params).token);
  if (!t) return page('This link is not valid', 'Please ask your building manager to send it again.', 404);
  if (t.expired) return page('This link has expired', `For your privacy, ${t.kind === 'receipt' ? 'receipt links work for a year' : 'bill links work for 90 days'}. Please ask your building manager to send it again on WhatsApp.`, 410);
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
