// Links to a customer's documents (bill voucher, receipt) that open without signing in, for the WhatsApp messages:
// WhatsApp Web can't attach a file to a message the CRM types in, so each message carries a link to its PDF.
// A link names the project, the kind and the id, signed with a server secret, so it can't be guessed or changed.
import crypto from 'node:crypto';
import { headers } from 'next/headers';

export type DocKind = 'bill' | 'receipt' | 'statement';
const KINDS: DocKind[] = ['bill', 'receipt', 'statement'];
const secret = () => process.env.DOC_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'minawa-local-docs';
const sign = (body: string) => crypto.createHmac('sha256', secret()).update(body).digest('base64url').slice(0, 22);

export function docToken(pid: string, kind: DocKind, id: string) {
  const body = Buffer.from(`${kind}|${pid}|${id}`).toString('base64url');
  return `${body}.${sign(body)}`;
}
export function readDocToken(t: string): { kind: DocKind; pid: string; id: string } | null {
  const [body, sig] = String(t || '').split('.');
  if (!body || !sig) return null;
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const [kind, pid, ...rest] = Buffer.from(body, 'base64url').toString('utf8').split('|');
  if (!KINDS.includes(kind as DocKind) || !pid || !rest.length) return null;
  return { kind: kind as DocKind, pid, id: rest.join('|') };
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
