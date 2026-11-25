'use client';
// Right after a building manager saves a payment (25 Nov 2026), his screen locks on "Send the receipt first": the
// receipt for that customer, ready to open in WhatsApp. Sending: the daily limit is checked, the chat opens with the
// receipt typed in, and coming back to the CRM asks "Did you send it?" (WaReturnPrompt), which records it. Cancel
// leaves the receipt for his accountant to send (it stays in the accountant's Receipts to send).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { prepareSendAction, releaseSendAction } from '@/lib/actions-send';
import type { SendItem } from '@/lib/manual-send';
import { openWhatsApp, chatUrl } from './wa-open';
import type { WaAnswer } from './WaReturnPrompt';
import { Wa } from './icons';

export function ReceiptLock({ pid, oid, name, apt, phone, amount, method, receipt, back, period = '' }: {
  pid: string; oid: string; name: string; apt: string; phone: string; amount: string; method: string; receipt: string; back: string; period?: string;
}) {
  const router = useRouter(), box = useRef<HTMLDivElement>(null);
  const [item, setItem] = useState<SendItem | null>(null), [state, setState] = useState<'loading' | 'ready' | 'none' | 'sent' | 'opened'>('loading'), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const leave = (t: string) => router.replace(`${back}?t=${encodeURIComponent(t)}`);

  // The receipt, written with today's figures (only this customer's receipt).
  useEffect(() => {
    let live = true;
    if (!phone) { setState('none'); return; }
    prepareSendAction({ pid, type: 'queue', ids: [oid], only: 'receipt' })
      .then(r => { if (!live) return; const it = r.items.find(x => x.kind === 'receipt') || null; setItem(it); setState(it ? 'ready' : 'sent'); if (!it && r.left[0]) setErr(r.left[0].why); })
      .catch(() => { if (live) { setState('ready'); setErr('The receipt could not be made ready. Check the connection and press Send again.'); } });
    return () => { live = false; };
  }, [pid, oid, phone]);

  // The answer to "Did you send it?" after coming back from WhatsApp unlocks the screen.
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<WaAnswer>).detail; if (item && d.key === item.key) leave(d.sent ? `Receipt sent to ${name}` : `Receipt not sent: it goes to your accountant to send`); };
    window.addEventListener('minawa:wa-answer', on);
    return () => window.removeEventListener('minawa:wa-answer', on);
  });

  // Keep the focus inside the locked box (Tab can't reach the page behind it).
  useEffect(() => { box.current?.querySelector<HTMLElement>('button')?.focus(); }, [state]);

  const send = async () => {
    if (!item) return;
    setBusy(true); setErr('');
    const r = await openWhatsApp({ pid, item, to: item.to, url: chatUrl(item.to, item.text) });
    setBusy(false);
    if (!r.ok) { setErr(r.error || 'The chat could not be opened.'); return; }
    if (r.blocked) { setErr('The browser blocked the WhatsApp tab. Allow pop-ups for the CRM and press Send again.'); return; }
    setState('opened');
  };
  const cancel = async () => {
    setBusy(true);
    try { await releaseSendAction({ pid, ownerIds: [oid] }); } catch { /* it frees itself in 10 minutes */ }
    leave('Receipt left for your accountant to send');
  };

  return <div className="mgr-lockwrap" role="dialog" aria-modal="true" aria-labelledby="rl-h">
    <div className="mgr-dim"></div>
    <div className="mgr-lock" ref={box} onKeyDown={e => { if (e.key === 'Escape') e.preventDefault(); }}>
      <div className="mgr-lk">Send the receipt first</div>
      <div className="mgr-ok" aria-hidden="true">✓</div>
      <h3 id="rl-h">Payment saved</h3>
      <p>{state === 'none' ? `${name} has no WhatsApp number in the CRM.` : state === 'sent' ? 'This receipt has already been sent.' : `Send ${name} the receipt on WhatsApp now.`}</p>
      <div className="mgr-rc">
        <div><span>Flat</span><b>{apt} · {name}</b></div>
        <div><span>Amount</span><b>{amount} · {method}</b></div>
        {period ? <div><span>Paid for</span><b>{period}</b></div> : null}
        <div><span>Receipt</span><b>{receipt}</b></div>
        <div><span>WhatsApp</span><b>{phone || 'none'}</b></div>
      </div>
      {err ? <div className="callout bad" role="alert" style={{ textAlign: 'left', marginBottom: 10 }}><div>{err}</div></div> : null}
      {state === 'none' || state === 'sent' ? <>
        <button type="button" className="mgr-wa grey" onClick={() => leave(state === 'none' ? 'Payment saved. Your accountant gets the receipt to the customer.' : 'Payment saved')}>Close</button>
        {state === 'none' ? <div className="mgr-note">The receipt goes to your accountant, who has it printed for the customer.</div> : null}
      </> : <>
        <button type="button" className="mgr-wa" onClick={send} disabled={busy || state === 'loading'}><Wa /> {state === 'loading' ? 'Getting the receipt ready…' : busy ? 'Opening WhatsApp…' : state === 'opened' ? 'Open WhatsApp again' : 'Send receipt on WhatsApp'}</button>
        {state === 'opened' ? <div className="mgr-note">Send it in WhatsApp, then come back here: you&apos;ll be asked whether it was sent.</div> : null}
        <button type="button" className="mgr-cancel" onClick={cancel} disabled={busy}>Cancel</button>
        <div className="mgr-note">If you cancel, the receipt goes to your accountant to send.</div>
      </>}
    </div>
  </div>;
}
