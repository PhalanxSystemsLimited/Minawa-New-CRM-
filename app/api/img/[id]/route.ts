// One photo, for signed-in staff of its building (21 Nov 2026). The CRM fetches it from Cloudinary and passes it on,
// so the Cloudinary link never reaches the browser and nobody can list the stored photos.
import { currentStaff, canOpen } from '@/lib/session';
import { getStore } from '@/lib/store';
import { getImageBytes } from '@/lib/images';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const { id } = await params;
  const r = /^IMG[A-Za-z0-9_-]{6,30}$/.test(id) ? await (await getStore()).getImage(id) : null;
  if (!r || !canOpen(staff, r.project)) return new Response('not found', { status: 404 });
  const b = await getImageBytes(r);
  if (!b) return new Response('This photo can\'t be opened right now.', { status: 502 });
  return new Response(new Uint8Array(b.bytes), { headers: { 'Content-Type': b.type, 'Cache-Control': 'private, max-age=3600', 'X-Robots-Tag': 'noindex', 'Content-Disposition': `inline; filename="${r.id}.${r.format}"` } });
}
