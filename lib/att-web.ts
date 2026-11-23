// The web side of the personal attendance link (23 Nov 2026): passkeys (WebAuthn) for the phone's fingerprint. The
// challenge for each step is kept in a short-lived signed cookie; the passkey is tied to this site's address.
import { cookies, headers } from 'next/headers';
import { getStore } from './store';
import { sign, unsign } from './attendance';
import type { Employee } from './types';

const CH = 'att_ch';
/** This site's address as the phone sees it: the passkey's "relying party" and the expected origin. */
export async function site() {
  const h = await headers(), host = (h.get('x-forwarded-host') || h.get('host') || 'localhost').split(',')[0].trim();
  const name = host.replace(/:\d+$/, ''), local = name === 'localhost' || name === '127.0.0.1';
  const proto = (h.get('x-forwarded-proto') || (local ? 'http' : 'https')).split(',')[0].trim();
  return { rpID: name, origin: `${proto}://${host}`, secure: proto === 'https' };
}
export async function putChallenge(o: { c: string; tok: string; k: 'reg' | 'auth' }) {
  const { secure } = await site();
  (await cookies()).set(CH, sign(o, 300), { httpOnly: true, sameSite: 'strict', secure, path: '/api/att', maxAge: 300 });
}
export async function takeChallenge(tok: string, k: 'reg' | 'auth') {
  const jar = await cookies(), o = unsign<{ c: string; tok: string; k: string }>(jar.get(CH)?.value);
  jar.delete({ name: CH, path: '/api/att' });
  return o && o.tok === tok && o.k === k ? o.c : null;
}
export async function empByToken(tok: string): Promise<Employee | null> {
  if (!tok || tok.length < 16) return null;
  return (await (await getStore()).listEmployees()).find(e => e.token === tok) || null;
}
/** "Android · Chrome", "iPhone · Safari"… from the browser's description. */
export function phoneLabel(ua: string) {
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? ((/Android [\d.]+; ([^;)]+)/.exec(ua)?.[1] || 'Android').replace(/Build.*$/, '').trim() || 'Android') : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : 'Phone';
  const br = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  return `${os} · ${br}`;
}
