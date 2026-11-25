// Opening a WhatsApp chat from the CRM (20 Nov 2026): the daily limit is checked on the server first. The tab is opened
// by the click itself (browsers block tabs opened later), then sent to the chat once the CRM says yes, or closed again
// if it was a new empty tab and the limit is reached.
import { takeChatAction, type ChatTake } from '@/lib/actions-send';
import type { SendItem } from '@/lib/manual-send';
import { awaitReturn } from '@/components/WaReturnPrompt';

const KEY = 'minawa.waFrom';
/** The number this browser last sent from (the person picks it in Send on WhatsApp). */
export function savedFrom(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
export function saveFrom(n: string) { try { localStorage.setItem(KEY, n); } catch { /* private mode */ } }

export async function openWhatsApp(a: { pid: string; item: SendItem; to: string; url: string; from?: string | null }): Promise<ChatTake & { blocked?: boolean }> {
  let pre: Window | null = null;
  try { pre = window.open('', 'minawa-whatsapp'); } catch { pre = null; }
  let r: ChatTake;
  try { r = await takeChatAction({ pid: a.pid, ownerId: a.item.ownerId, from: a.from ?? savedFrom() }); }
  catch { r = { ok: false, error: 'Could not check the daily limit. Check the connection and try again.' }; }
  if (!r.ok) {
    // Only a tab this click opened (still empty) is closed; an open WhatsApp tab is left alone.
    try { if (pre && pre.location.href === 'about:blank') pre.close(); } catch { /* the WhatsApp tab: leave it */ }
    return r;
  }
  awaitReturn(a.pid, { ...a.item, from: r.from || null }, a.to);
  if (pre) { try { pre.location.href = a.url; pre.focus(); return r; } catch { /* fall through */ } }
  const w = window.open(a.url, 'minawa-whatsapp');
  if (!w) return { ...r, blocked: true };
  try { w.focus(); } catch { /* ignore */ }
  return r;
}

/** The chat link: WhatsApp Web, or the app on phones (the same choice as in Send on WhatsApp). */
export function chatUrl(to: string, text: string) {
  let via: string | null = null;
  try { via = localStorage.getItem('minawa.waVia'); } catch { /* private mode */ }
  if (via !== 'app' && via !== 'web') via = window.matchMedia?.('(pointer: coarse)').matches ? 'app' : 'web';
  return via === 'web' ? `https://web.whatsapp.com/send?phone=${to}&text=${encodeURIComponent(text)}` : `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
