// Upload one photo (21 Nov 2026). The phone has already shrunk it (components/PhotoField.tsx). Signed-in staff only,
// for a building they work in; the photo goes to Cloudinary (private) and its record and link into Supabase. Returns
// the photo's id, which the form then saves with the payment entry or the electricity bill.
import { currentStaff, staffName, canOpen } from '@/lib/session';
import { getStore } from '@/lib/store';
import { putImage, photoStore, NOT_SET_UP, MAX_BYTES } from '@/lib/images';

export const dynamic = 'force-dynamic';
const no = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const staff = await currentStaff();
  if (!staff) return no('Sign in again, then add the photo.', 401);
  if (!photoStore()) return no(NOT_SET_UP, 503);
  let fd: FormData;
  try { fd = await req.formData(); } catch { return no('The photo didn\'t arrive. Try again.'); }
  const pid = String(fd.get('pid') || ''), kind = fd.get('kind') === 'bill' ? 'bill' : 'payment', owner = String(fd.get('owner') || '') || null, file = fd.get('file');
  if (!pid || !canOpen(staff, pid)) return no('This building isn\'t assigned to you.', 403);
  if (kind === 'bill' && staff.role !== 'accountant' && staff.role !== 'admin') return no('Bill photos are added by the Accountant.', 403);
  if (!(file instanceof Blob) || !file.size) return no('No photo was chosen.');
  if (file.size > MAX_BYTES) return no('This photo is too big even after shrinking it. Take it again a little further away.');
  try {
    const rec = await putImage(new Uint8Array(await file.arrayBuffer()), { project: pid, ownerId: owner, kind, refId: null, byId: staff.id, byName: staffName(staff) });
    await (await getStore()).saveImage(rec);
    return Response.json({ id: rec.id, bytes: rec.bytes, width: rec.width, height: rec.height });
  } catch (e) { return no((e as Error).message || 'The photo couldn\'t be stored. Try again.', 500); }
}
