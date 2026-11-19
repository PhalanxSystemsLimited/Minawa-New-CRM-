// Links to a customer's documents (bill voucher, receipt) that open without signing in, for the WhatsApp messages:
// WhatsApp Web can't attach a file to a message the CRM types in, so each message carries a link to its PDF.
// A link names the project, the kind and the id, signed with a server secret, so it can't be guessed or changed.
import crypto from 'node:crypto';
import { headers } from 'next/headers';

export type DocKind = 'bill' | 'receipt' | 'statement';
const KINDS: DocKind[] = ['bill', 'receipt', 'statement'];
const secret = () => process.env.DOC_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'minawa-local-docs';
const sign = (body: string) => crypto.createHmac('sha256', secret()).update(body).digest('base64url').slice(0, 22);

/** How long a link works (21 Nov 2026): a bill voucher or statement 90 days, a receipt a year. A new link is made
 *  every time a message is sent, so resending gives the customer a fresh one. */
export const LINK_DAYS: Record<DocKind, number> = { bill: 90, statement: 90, receipt: 365 };
const DAY = 86400000;

export function docToken(pid: string, kind: DocKind, id: string, now = Date.now()) {
  const exp = Math.floor(now / DAY) + LINK_DAYS[kind];   // the last day it works (days since 1970)
  const body = Buffer.from(`2|${kind}|${pid}|${exp}|${id}`).toString('base64url');
  return `${body}.${sign(body)}`;
}
export function readDocToken(t: string, now = Date.now()): { kind: DocKind; pid: string; id: string; expired: boolean } | null {
  const [body, sig] = String(t || '').split('.');
  if (!body || !sig) return null;
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const parts = Buffer.from(body, 'base64url').toString('utf8').split('|');
  if (parts[0] === '2') {
    const [, kind, pid, exp, ...rest] = parts;
    if (!KINDS.includes(kind as DocKind) || !pid || !/^\d+$/.test(exp) || !rest.length) return null;
    return { kind: kind as DocKind, pid, id: rest.join('|'), expired: Math.floor(now / DAY) > +exp };
  }
  // Links made before 21 Nov 2026 (no date in them; none were sent from live).
  const [kind, pid, ...rest] = parts;
  if (!KINDS.includes(kind as DocKind) || !pid || !rest.length) return null;
  return { kind: kind as DocKind, pid, id: rest.join('|'), expired: false };
}
/** The CRM's public address: APP_URL, or the address this request came in on. */
export async function siteOrigin() {
  const env = (process.env.APP_URL || '').replace(/\/$/, '');
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env;
  try {
    const h = await headers(), host = h.get('x-forwarded-host') || h.get('host');
    if (host) return `${h.get('x-forwarded-proto') || (/localhost|127\.0\.0\.1/.test(host) ? 'http' : 'https')}://${host}`;
  } catch { /* outside a request */ }
  return env;
}
