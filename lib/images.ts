// Photos (21 Nov 2026): bank-transfer screens and receipts taken at payment entry, and Oakwood electricity bill photos.
// The phone shrinks each photo before it is sent (components/PhotoField.tsx); the server checks it and stores it in
// Cloudinary as a private ("authenticated") image, and keeps its record and link in Supabase (table `images`).
// Nobody browses Cloudinary: staff open one photo at a time through the CRM (/api/img/<id>, checked against their
// buildings), and a customer only sees the photo printed on their own bill (the bill link in their WhatsApp message).
// Without Cloudinary settings, a laptop copy (no Supabase) keeps photos in data/images; live shows "not set up yet".
// Server only: the API secret never reaches the browser.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ImageRec } from './types';

export const MAX_BYTES = 3 * 1024 * 1024;   // after the phone has shrunk it (usually 100–400 KB)

const env = () => ({ cloud: process.env.CLOUDINARY_CLOUD_NAME || '', key: process.env.CLOUDINARY_API_KEY || '', secret: process.env.CLOUDINARY_API_SECRET || '', folder: (process.env.CLOUDINARY_FOLDER || 'minawa-crm').replace(/[^a-zA-Z0-9_/-]/g, '') });
export const cloudinaryOn = () => { const e = env(); return !!(e.cloud && e.key && e.secret); };
const supabaseOn = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
/** Where photos go: Cloudinary when set up; on disk for a laptop copy; nowhere (live without Cloudinary). */
export const photoStore = (): 'cloudinary' | 'local' | null => cloudinaryOn() ? 'cloudinary' : supabaseOn() ? null : 'local';
export const NOT_SET_UP = 'Photo storage isn\'t set up yet: the Admin adds the Cloudinary settings (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) in Vercel.';

const LOCAL_DIR = path.join(process.cwd(), 'data', 'images');

/** Cloudinary's API signature: the parameters in name order, joined, followed by the secret, SHA-1. */
export function apiSignature(params: Record<string, string | number>, secret: string) {
  const s = Object.keys(params).filter(k => params[k] !== '' && params[k] != null).sort().map(k => `${k}=${params[k]}`).join('&');
  return crypto.createHash('sha1').update(s + secret).digest('hex');
}
/** The signed delivery link of a private image (what Cloudinary serves to whoever holds the exact link). */
export function deliveryUrl(cloud: string, secret: string, publicId: string, format: string, version?: number | string) {
  const src = `${publicId}.${format}`;
  const sig = crypto.createHash('sha1').update(src + secret).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').slice(0, 8);
  return `https://res.cloudinary.com/${cloud}/image/authenticated/s--${sig}--/${version ? `v${version}/` : ''}${src}`;
}

/** What kind of picture the bytes are (JPEG or PNG only: they print on the PDFs). */
export function sniff(b: Uint8Array): 'jpg' | 'png' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  return null;
}
/** Width and height from a JPEG or PNG header (for the record; 0 when not found). */
export function sizeOf(b: Uint8Array, f: 'jpg' | 'png'): [number, number] {
  if (f === 'png') return [(b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0];
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], len = b[i + 2] << 8 | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b[i + 7] << 8 | b[i + 8], b[i + 5] << 8 | b[i + 6]];
    i += 2 + len;
  }
  return [0, 0];
}

export const newImageId = () => 'IMG' + crypto.randomBytes(9).toString('base64url');

/** Stores the photo and returns its record (not yet saved in the store: the caller saves it). */
export async function putImage(bytes: Uint8Array, meta: Omit<ImageRec, 'id' | 'url' | 'publicId' | 'format' | 'bytes' | 'width' | 'height' | 'at'>): Promise<ImageRec> {
  const where = photoStore();
  if (!where) throw new Error(NOT_SET_UP);
  if (bytes.length > MAX_BYTES) throw new Error('This photo is too big even after shrinking it. Take it again a little further away.');
  const f = sniff(bytes);
  if (!f) throw new Error('This isn\'t a photo the CRM can keep (JPG or PNG only). Take the photo again with the camera button.');
  const [width, height] = sizeOf(bytes, f), id = newImageId(), at = new Date().toISOString();
  const base = { ...meta, id, format: f, bytes: bytes.length, width, height, at };
  if (where === 'local') {
    fs.mkdirSync(LOCAL_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_DIR, `${id}.${f}`), bytes);
    return { ...base, url: `local:${id}.${f}`, publicId: id };
  }
  const e = env(), timestamp = Math.floor(Date.now() / 1000), folder = `${e.folder}/${meta.project}/${meta.kind}`;
  const signed = { folder, public_id: id, timestamp, type: 'authenticated' };
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: f === 'png' ? 'image/png' : 'image/jpeg' }), `${id}.${f}`);
  for (const [k, v] of Object.entries(signed)) form.append(k, String(v));
  form.append('api_key', e.key); form.append('signature', apiSignature(signed, e.secret));
  const r = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(e.cloud)}/image/upload`, { method: 'POST', body: form });
  const j = await r.json().catch(() => ({})) as { public_id?: string; version?: number; format?: string; secure_url?: string; bytes?: number; width?: number; height?: number; error?: { message?: string } };
  if (!r.ok || !j.public_id) throw new Error(`The photo couldn't be stored (Cloudinary: ${j.error?.message || r.status}). Try again.`);
  const format = j.format || f, url = j.secure_url && j.secure_url.includes('/s--') ? j.secure_url : deliveryUrl(e.cloud, e.secret, j.public_id, format, j.version);
  return { ...base, url, publicId: j.public_id, format, bytes: j.bytes || bytes.length, width: j.width || width, height: j.height || height };
}

/** The photo's bytes, for showing it to signed-in staff and printing it on a bill. */
export async function getImageBytes(r: ImageRec): Promise<{ bytes: Uint8Array; type: string } | null> {
  const type = r.format === 'png' ? 'image/png' : 'image/jpeg';
  if (r.url.startsWith('local:')) {
    const f = path.join(LOCAL_DIR, path.basename(r.url.slice(6)));
    return fs.existsSync(f) ? { bytes: new Uint8Array(fs.readFileSync(f)), type } : null;
  }
  const e = env();
  if (!cloudinaryOn()) return null;
  // Cloudinary's signed download of a private image (valid for a minute), so the stored link itself never travels.
  const p = { public_id: r.publicId, format: r.format, type: 'authenticated', timestamp: Math.floor(Date.now() / 1000), expires_at: Math.floor(Date.now() / 1000) + 60 };
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])), api_key: e.key, signature: apiSignature(p, e.secret) });
  for (const u of [`https://api.cloudinary.com/v1_1/${encodeURIComponent(e.cloud)}/image/download?${q}`, r.url]) {
    try { const x = await fetch(u, { cache: 'no-store' }); if (x.ok) return { bytes: new Uint8Array(await x.arrayBuffer()), type: x.headers.get('content-type') || type }; } catch { /* try the next */ }
  }
  return null;
}
/** A photo as a data: URI (for the PDFs). */
export async function imageDataUri(r: ImageRec | null) {
  if (!r) return null;
  const b = await getImageBytes(r);
  return b ? `data:${b.type};base64,${Buffer.from(b.bytes).toString('base64')}` : null;
}

/** Puts the photos' pictures into documents before printing (photos that can't be read are left out). */
export async function fillPhotos<T extends { photos?: { id: string; src?: string | null }[] | null }>(docs: T[]): Promise<T[]> {
  const { getStore } = await import('./store');
  const store = await getStore();
  for (const d of docs) for (const p of d.photos || []) {
    try { p.src = await imageDataUri(await store.getImage(p.id)); } catch { p.src = null; }
  }
  return docs;
}
