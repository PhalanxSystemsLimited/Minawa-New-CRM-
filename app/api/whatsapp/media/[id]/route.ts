// Staff can open a screenshot an owner sent on WhatsApp (proxied, because Meta's media URLs need the token).
import { currentStaff } from '@/lib/session';
import { downloadMedia } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentStaff())) return new Response('sign in first', { status: 401 });
  const { id } = await params;
  try {
    const m = await downloadMedia(id);
    const r = await fetch(m.url, { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } });
    return new Response(r.body, { headers: { 'Content-Type': m.mime || 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' } });
  } catch (e) { return new Response(`Couldn't load it from WhatsApp: ${(e as Error).message}`, { status: 502 }); }
}
