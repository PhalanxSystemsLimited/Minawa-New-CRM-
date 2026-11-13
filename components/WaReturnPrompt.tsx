'use client';
// Back from WhatsApp: when staff open a chat from the CRM and then come back to it, ask whether they sent the message.
// Yes records it as sent (on the owner's history and in staff activity); No records that the chat was opened but the
// message was not sent. Mounted once for the whole CRM, so it asks even if they come back to a different page.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recordSentAction, recordNotSentAction } from '@/lib/actions-send';
import type { SendItem } from '@/lib/manual-send';
import { Wa } from './icons';

interface Await { pid: string; item: SendItem; to: string; at: number; left: boolean }
const KEY = 'minawa.waAwait', MAX_AGE = 12 * 3600e3;
let memory: Await | null = null;   // if the browser blocks storage

function read(): Await | null {
  let a = memory;
  try { const v = sessionStorage.getItem(KEY); a = v ? JSON.parse(v) : null; } catch { /* storage blocked */ }
  return a && Date.now() - a.at < MAX_AGE ? a : null;
}
function write(a: Await | null) {
  memory = a;
  try { if (a) sessionStorage.setItem(KEY, JSON.stringify(a)); else sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

/** Called when a chat is opened: ask about this message when they come back. */
export function awaitReturn(pid: string, item: SendItem, to: string) {
  write({ pid, item, to, at: Date.now(), left: false });
  window.dispatchEvent(new CustomEvent('minawa:wa-await'));
}
/** The message was answered another way (e.g. "Mark as sent" or Skip): don't ask. */
export function clearAwait(key?: string) {
  const a = read();
  if (a && (!key || a.item.key === key)) write(null);
}
export type WaAnswer = { key: string; sent: boolean; ok: boolean };

export function WaReturnPrompt() {
  const router = useRouter();
  const [ask, setAsk] = useState<Await | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const awayAt = useRef(0), hidden = useRef(false), yesBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const a = read();
    if (a?.left) setAsk(a);   // came back to a fresh page load (e.g. the tab reloaded)
    const leave = () => { const x = read(); if (!x) return; awayAt.current = Date.now(); if (!x.left) write({ ...x, left: true }); };
    const back = () => {
      const x = read(); if (!x?.left) return;
      // A short blur (devtools, a browser menu) isn't a trip to WhatsApp.
      if (!hidden.current && Date.now() - awayAt.current < 1500) { write({ ...x, left: false }); return; }
      hidden.current = false; setErr(''); setAsk(x);
    };
    const vis = () => { if (document.visibilityState === 'hidden') { hidden.current = true; leave(); } else back(); };
    const opened = () => { awayAt.current = Date.now(); };
    window.addEventListener('blur', leave); window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', vis); window.addEventListener('minawa:wa-await', opened);
    return () => { window.removeEventListener('blur', leave); window.removeEventListener('focus', back); document.removeEventListener('visibilitychange', vis); window.removeEventListener('minawa:wa-await', opened); };
  }, []);
  useEffect(() => { if (ask) yesBtn.current?.focus(); }, [ask]);

  if (!ask) return null;
  const { item } = ask;
  const answer = async (sent: boolean) => {
    setBusy(true); setErr('');
    let ok = false;
    try { ok = (sent ? await recordSentAction({ pid: ask.pid, item, via: 'prompt' }) : await recordNotSentAction({ pid: ask.pid, item })).ok; } catch { ok = false; }
    setBusy(false);
    if (!ok) { setErr('Couldn\'t save that. Check the connection and try again.'); return; }
    write(null); setAsk(null);
    window.dispatchEvent(new CustomEvent<WaAnswer>('minawa:wa-answer', { detail: { key: item.key, sent, ok } }));
    router.refresh();
  };
  const later = () => { write({ ...ask, left: false }); setAsk(null); };

  return <div className="wa-ask">
    <div className="m-back"></div>
    <div className="m-card" role="alertdialog" aria-modal="true" aria-labelledby="wa-ask-h">
      <div className="m-head"><h3 id="wa-ask-h">Did you send the message?</h3></div>
      <div className="m-body">
        <div className="wa-ask-who"><span className="wa-logo"><Wa /></span><div style={{ minWidth: 0 }}>
          <b>Apt {item.apt} · {item.name}</b><div className="cell-sub num">+{ask.to}{ask.to !== item.to ? ` (testing; owner's number ${item.phone})` : ''}</div>
          <div className="cell-sub">{item.title}</div></div></div>
        <p className="wa-ask-msg">{item.text.length > 260 ? item.text.slice(0, 260) + '…' : item.text}</p>
        {err ? <div className="callout bad" style={{ marginBottom: 12 }}><div>{err}</div></div> : null}
        <div className="m-actions">
          <button type="button" className="link-btn" style={{ marginRight: 'auto' }} onClick={later} disabled={busy}>Not yet, ask me later</button>
          <button type="button" className="btn" onClick={() => answer(false)} disabled={busy}>No, not sent</button>
          <button type="button" ref={yesBtn} className="btn primary" onClick={() => answer(true)} disabled={busy}>{busy ? 'Saving…' : 'Yes, sent'}</button>
        </div>
      </div>
    </div>
  </div>;
}
