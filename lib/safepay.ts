// Safepay Quick Links (payment links), ported from the demo's scripts/safepay_sandbox.py.
// SAFEPAY_ENV=sandbox (default) or production. Amounts are whole rupees.
import crypto from 'node:crypto';

const HOST = () => process.env.SAFEPAY_API_URL || (process.env.SAFEPAY_ENV === 'production' ? 'https://api.getsafepay.com' : 'https://sandbox.api.getsafepay.com');
export const safepayConfigured = () => !!process.env.SAFEPAY_SECRET_KEY;
export const safepayMode = (): 'live' | 'sandbox' => process.env.SAFEPAY_ENV === 'production' ? 'live' : 'sandbox';

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(HOST() + path, {
    method, cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'MinawaERP/1.0', 'X-SFPY-MERCHANT-SECRET': process.env.SAFEPAY_SECRET_KEY || '' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text || '{}'); } catch { json = { raw: text.slice(0, 500) }; }
  return { status: res.status, json };
}

export interface SpBrief { id: string; url: string; tracker: string | null; status: string; isPaid: boolean; isExpired: boolean; total: number; reference: string | null }
function linkFrom(payload: Record<string, unknown>) {
  let data = (payload.data || {}) as Record<string, unknown>;
  if (data && typeof data.link === 'object' && data.link) data = data.link as Record<string, unknown>;
  return data && data.id ? data : null;
}
const PAID = /^(paid|completed|complete|success|succeeded|captured|settled)$/i;
function brief(link: Record<string, unknown>): SpBrief {
  const meta = ((link.metadata as Record<string, unknown>[]) || [{}])[0] || {};
  const pays = Array.isArray(link.payment) ? link.payment as Record<string, unknown>[] : link.payment && typeof link.payment === 'object' ? [link.payment as Record<string, unknown>] : [];
  // Any payment on the link that Safepay marks as paid (the first entry is not always the successful one).
  const ok = pays.find(p => p.is_paid === true || PAID.test(String(p.state || p.status || '')));
  const pay = ok || pays[0] || {};
  return { id: String(link.id), url: String(meta.recipient_view_url || ''), tracker: (pay.sp_tracker as string) || (pay.tracker as string) || null, status: String(link.status || ''),
    isPaid: !!ok || PAID.test(String(link.status || '')), isExpired: !!link.is_expired, total: Number(link.total || 0), reference: (link.reference as string) || null };
}
function errOf(json: Record<string, unknown>, status: number) {
  const s = json.status as { message?: string; errors?: string[] } | undefined;
  return (s && (s.errors?.join(', ') || s.message)) || (json.message as string) || `Safepay answered HTTP ${status}`;
}

/** Create a one-time payment link for an exact amount. `reference` is our link id (PL-…). */
export async function createQuickLink(amount: number, reference: string, note: string): Promise<SpBrief> {
  const { status, json } = await call('POST', '/invoice/quick-links/v2/', { amount: Math.round(amount), currency: 'PKR', note: note.slice(0, 250), reference, workflow: 'MANUAL' });
  const link = linkFrom(json);
  if (status >= 300 || !link) throw new Error(errOf(json, status));
  return brief(link);
}
export async function getQuickLink(id: string): Promise<SpBrief> {
  const { status, json } = await call('GET', `/invoice/quick-links/v2/${encodeURIComponent(id)}`);
  const link = linkFrom(json);
  if (status >= 300 || !link) throw new Error(errOf(json, status));
  return brief(link);
}

/** Webhook signature: X-SFPY-SIGNATURE = hex HMAC-SHA512 with the endpoint's shared secret (Developers › Endpoints).
 *  Safepay's docs sign the JSON payload; we accept the raw body, the re-serialised JSON, or its `data` part.
 *  A payment is still only recorded after Safepay's API confirms it, so this is a second check, not the only one. */
export function verifySignature(raw: string, sig: string | null) {
  const secret = process.env.SAFEPAY_WEBHOOK_SECRET;
  if (!secret || !sig) return false;
  const got = Buffer.from(sig.trim().toLowerCase());
  const forms = [raw];
  try { const j = JSON.parse(raw); forms.push(JSON.stringify(j)); if (j && j.data !== undefined) forms.push(JSON.stringify(j.data)); } catch { /* not JSON */ }
  return forms.some(f => { const want = Buffer.from(crypto.createHmac('sha512', secret).update(f).digest('hex')); return want.length === got.length && crypto.timingSafeEqual(want, got); });
}
