'use client';
// To do › a message that didn't arrive: fix the number (or add one), then send the latest balance by hand. Saving gets
// the message ready; "Open WhatsApp chat" opens the owner's chat with it typed in; coming back to the CRM asks "Did you
// send the message?". It leaves To do only when the answer is yes.
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fixNumberSendAction, resendFixedAction, type ResendResult } from '@/lib/actions-send';
import { awaitReturn } from './WaReturnPrompt';
import { Wa } from './icons';

/** WhatsApp Web, or the app on phones (the same choice as in Send on WhatsApp). */
function chatUrl(to: string, text: string) {
  let via: string | null = null;
  try { via = localStorage.getItem('minawa.waVia'); } catch { /* private mode */ }
  if (via !== 'app' && via !== 'web') via = window.matchMedia?.('(pointer: coarse)').matches ? 'app' : 'web';
  return via === 'web' ? `https://web.whatsapp.com/send?phone=${to}&text=${encodeURIComponent(text)}` : `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

/** Opens the chat from the click itself (a tab opened later, after the server answers, is blocked by browsers), and asks
 *  "Did you send the message?" on coming back. */
function openChat(pid: string, r: Ready) {
  awaitReturn(pid, r.item, r.to);
  const w = window.open(chatUrl(r.to, r.item.text), 'minawa-whatsapp');
  try { w?.focus(); } catch { /* ignore */ }
}
type Ready = { item: NonNullable<ResendResult['item']>; to: string; toast?: string };
const readyOf = (r: ResendResult): Ready | null => r.ok && r.item && r.to ? { item: r.item, to: r.to, toast: r.toast } : null;

/** The message, ready: one click opens the owner's chat with it typed in. */
function ReadyBox({ r, saved }: { r: Ready; saved?: string }) {
  return <>{saved ? <div className="callout good"><div>{saved}</div></div> : null}
    <div className="wa-ready"><div className="cell-sub">Message for {r.item.name}, Apt {r.item.apt}, to +{r.to}</div><pre>{r.item.text}</pre></div></>;
}

const withToast = (path: string, t?: string) => t ? `${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(t)}` : path;

export function FixNumberForm({ pid, oid, name, phone, noPhone, hand, owes }: { pid: string; oid: string; name: string; phone: string; noPhone: boolean; hand: boolean; owes: boolean }) {
  const router = useRouter(), sp = useSearchParams();
  const [v, setV] = useState(noPhone ? '' : phone), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [ready, setReady] = useState<Ready | null>(null);
  const back = sp.get('from') === 'todo' ? `/p/${pid}/todo` : `/p/${pid}/apartments/${oid}`;
  const opens = hand && owes;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (v.replace(/\D/g, '').length < 10) { setErr('That doesn\'t look like a full WhatsApp number. Include the country code, e.g. +92.'); return; }
    setBusy(true); setErr('');
    let r: ResendResult;
    try { r = await fixNumberSendAction({ pid, oid, phone: v }); } catch { r = { ok: false, error: 'Couldn\'t save that. Check the connection and try again.' }; }
    setBusy(false);
    if (!r.ok) { setErr(r.error || 'Not saved. Try again.'); return; }
    const x = readyOf(r);
    if (x) { setReady(x); return; }   // step 2: open the chat
    router.replace(withToast(back, r.toast)); router.refresh();
  };
  if (ready) return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <ReadyBox r={ready} saved={`Number saved: ${v}. Now open the chat and send the message.`} />
    <div className="callout">When you come back you&apos;ll be asked whether it was sent. It leaves To do once you say yes.</div>
    <div className="m-actions"><button type="button" className="btn" onClick={() => router.replace(withToast(back, 'Number saved. The message is still in To do until it is sent.'))}>Later</button>
      <button type="button" className="btn wa" autoFocus onClick={() => { openChat(pid, ready); router.replace(withToast(back, 'Send the message in WhatsApp, then come back here and confirm it was sent.')); }}><Wa /> Open WhatsApp chat</button></div>
  </div>;
  return <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div className="form-row"><label htmlFor="fx">{noPhone ? 'WhatsApp number' : 'Correct number'} for {name}</label>
      <input id="fx" name="phone" type="tel" required placeholder="+92 3xx xxx xxxx" value={v} onChange={e => setV(e.target.value)} autoFocus /></div>
    {err ? <div className="callout bad"><div>{err}</div></div> : null}
    <div className="callout">{!hand ? 'Saving resends the latest balance with a fresh payment link.'
      : owes ? <>Saving gets the latest balance and a fresh payment link ready for {name}. Then open the WhatsApp chat, send it, and come back here: you&apos;ll be asked whether it was sent. It leaves To do once you say yes.</>
      : 'Nothing is owed, so there is nothing to resend. Saving just keeps the number.'}</div>
    <div className="m-actions"><button type="button" className="btn" onClick={() => router.replace(back)} disabled={busy}>Cancel</button>
      <button type="submit" className={`btn ${opens ? 'wa' : 'primary'}`} disabled={busy}>{busy ? 'Saving…' : opens ? <><Wa /> Save and get the message ready</> : hand ? 'Save number' : 'Save and resend'}</button></div>
  </form>;
}

/** To do: the number is fixed but the message wasn't sent yet. Gets it ready, then one click opens the chat. */
export function ResendButton({ pid, oid }: { pid: string; oid: string }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [ready, setReady] = useState<Ready | null>(null);
  const prepare = async () => {
    setBusy(true); setErr('');
    let r: ResendResult;
    try { r = await resendFixedAction({ pid, oid }); } catch { r = { ok: false, error: 'Try again' }; }
    setBusy(false);
    if (!r.ok) { setErr(r.error || 'Try again'); return; }
    const x = readyOf(r);
    if (x) setReady(x); else { router.replace(withToast(`/p/${pid}/todo`, r.toast)); router.refresh(); }
  };
  return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{err ? <span className="cell-sub" style={{ color: 'var(--bad)' }}>{err}</span> : null}
    {ready ? <button type="button" className="btn sm wa" autoFocus onClick={() => { openChat(pid, ready); setReady(null); }}><Wa /> Open WhatsApp chat</button>
      : <button type="button" className="btn sm wa" onClick={prepare} disabled={busy}><Wa /> {busy ? 'Getting it ready…' : 'Send on WhatsApp'}</button>}</span>;
}
