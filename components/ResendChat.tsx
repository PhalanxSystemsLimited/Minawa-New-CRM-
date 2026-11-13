'use client';
// To do › a message that didn't arrive: fix the number (or add one), then send the latest balance by hand. Saving opens
// the owner's WhatsApp chat with the message typed in; coming back to the CRM asks "Did you send the message?". It
// leaves To do only when the answer is yes.
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

/** Opens the WhatsApp tab straight away (so the browser doesn't block it), then points it at the chat once the
 *  message is ready. Returns the result for the caller's toast. */
async function openWith(pid: string, open: boolean, run: () => Promise<ResendResult>) {
  const w = open ? window.open('about:blank', 'minawa-whatsapp') : null;
  let r: ResendResult;
  try { r = await run(); } catch { r = { ok: false, error: 'Couldn\'t save that. Check the connection and try again.' }; }
  if (r.ok && r.item && r.to) {
    const url = chatUrl(r.to, r.item.text);
    if (w && !w.closed) { awaitReturn(pid, r.item, r.to, true); w.location.href = url; try { w.focus(); } catch { /* ignore */ } }
    else { awaitReturn(pid, r.item, r.to); const x = window.open(url, 'minawa-whatsapp'); try { x?.focus(); } catch { /* ignore */ } }
  } else if (w && !w.closed) w.close();
  return r;
}
const withToast = (path: string, t?: string) => t ? `${path}${path.includes('?') ? '&' : '?'}t=${encodeURIComponent(t)}` : path;

export function FixNumberForm({ pid, oid, name, phone, noPhone, hand, owes }: { pid: string; oid: string; name: string; phone: string; noPhone: boolean; hand: boolean; owes: boolean }) {
  const router = useRouter(), sp = useSearchParams();
  const [v, setV] = useState(noPhone ? '' : phone), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const back = sp.get('from') === 'todo' ? `/p/${pid}/todo` : `/p/${pid}/apartments/${oid}`;
  const opens = hand && owes;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (v.replace(/\D/g, '').length < 10) { setErr('That doesn\'t look like a full WhatsApp number. Include the country code, e.g. +92.'); return; }
    setBusy(true); setErr('');
    const r = await openWith(pid, opens, () => fixNumberSendAction({ pid, oid, phone: v }));
    if (!r.ok) { setBusy(false); setErr(r.error || 'Not saved. Try again.'); return; }
    router.replace(withToast(back, r.toast)); router.refresh();
  };
  return <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <div className="form-row"><label htmlFor="fx">{noPhone ? 'WhatsApp number' : 'Correct number'} for {name}</label>
      <input id="fx" name="phone" type="tel" required placeholder="+92 3xx xxx xxxx" value={v} onChange={e => setV(e.target.value)} autoFocus /></div>
    {err ? <div className="callout bad"><div>{err}</div></div> : null}
    <div className="callout">{!hand ? 'Saving resends the latest balance with a fresh payment link.'
      : owes ? <>Saving opens {name}&apos;s WhatsApp chat with the latest balance and a fresh payment link typed in. Send it, then come back here: you&apos;ll be asked whether it was sent. It leaves To do once you say yes.</>
      : 'Nothing is owed, so there is nothing to resend. Saving just keeps the number.'}</div>
    <div className="m-actions"><button type="button" className="btn" onClick={() => router.replace(back)} disabled={busy}>Cancel</button>
      <button type="submit" className={`btn ${opens ? 'wa' : 'primary'}`} disabled={busy}>{busy ? 'Working…' : opens ? <><Wa /> Save and open WhatsApp</> : hand ? 'Save number' : 'Save and resend'}</button></div>
  </form>;
}

/** To do: the number is fixed but the message wasn't sent yet. Opens the chat again. */
export function ResendButton({ pid, oid }: { pid: string; oid: string }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    const r = await openWith(pid, true, () => resendFixedAction({ pid, oid }));
    setBusy(false);
    if (!r.ok) { setErr(r.error || 'Try again'); return; }
    if (!r.item) router.replace(withToast(`/p/${pid}/todo`, r.toast));
    router.refresh();
  };
  return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{err ? <span className="cell-sub" style={{ color: 'var(--bad)' }}>{err}</span> : null}
    <button type="button" className="btn sm wa" onClick={go} disabled={busy}><Wa /> {busy ? 'Opening…' : 'Send on WhatsApp'}</button></span>;
}
