'use client';
// The buttons on a personal attendance link (23 Nov 2026): register this phone (the phone asks for the fingerprint and
// makes a passkey), or check in / check out (location first, then the fingerprint), and "Ask manager" when refused.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';

type Step = 'idle' | 'loc' | 'finger' | 'saving';
const post = async (url: string, body: object) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return r.json().catch(() => ({ ok: false, error: 'No answer from the server. Check your internet and try again.' })) as Promise<Record<string, unknown>>; };
const where = () => new Promise<GeolocationPosition>((ok, bad) => {
  if (!navigator.geolocation) { bad(new Error('This browser can\'t share your location.')); return; }
  navigator.geolocation.getCurrentPosition(ok, e => bad(new Error(e.code === 1 ? 'Location is blocked for this page. Allow Location for this site in your browser settings, then try again.' : e.code === 3 ? 'Your phone took too long to find its location. Go near a window or outside and try again.' : 'Your phone could not find its location. Turn on Location and try again.')), { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
});
const fingerErr = (e: unknown) => { const n = (e as Error)?.name; return n === 'NotAllowedError' ? 'The fingerprint was cancelled or not recognised. Try again.' : n === 'InvalidStateError' ? 'This phone is already registered.' : `The fingerprint step failed: ${(e as Error)?.message || 'unknown error'}`; };

export function AttPanel({ token, state, next, label, registeredAt, noArea, pending }: { token: string; state: 'register' | 'pending' | 'ready' | 'android'; next: 'checkin' | 'checkout' | 'done'; label: string; registeredAt: string; noArea: boolean; pending: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('idle'), [msg, setMsg] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null), [ticket, setTicket] = useState<string | null>(null), [note, setNote] = useState('');
  const busy = step !== 'idle';
  if (state !== 'ready' && state !== 'register') return <div className="att-act">
    {state === 'pending' ? <div className="callout warn"><div><b>Waiting for approval.</b> This phone ({label}) was registered on {registeredAt}. Your building manager approves it; then you can check in here.</div></div>
      : <div className="callout info"><div>Your phone uses the <b>Minawa Attendance app</b>. Check in and out from the app.</div></div>}
  </div>;
  const supported = typeof window === 'undefined' || browserSupportsWebAuthn();
  const register = async () => {
    setMsg(null); setStep('finger');
    try {
      const o = await post('/api/att/reg', { action: 'options', token });
      if (!o.ok) throw new Error(String(o.error));
      let resp; try { resp = await startRegistration({ optionsJSON: o.options as never }); } catch (e) { throw new Error(fingerErr(e)); }
      setStep('saving');
      const v = await post('/api/att/reg', { action: 'verify', token, response: resp });
      if (!v.ok) throw new Error(String(v.error));
      setMsg({ tone: 'good', text: 'Phone registered. Your building manager will approve it; then you can check in.' });
      router.refresh();
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
    setStep('idle');
  };
  const doMark = async (kind: 'checkin' | 'checkout') => {
    setMsg(null); setTicket(null); setStep('loc');
    try {
      const pos = await where();
      setStep('finger');
      const o = await post('/api/att/mark', { action: 'options', token });
      if (!o.ok) throw new Error(String(o.error));
      let resp; try { resp = await startAuthentication({ optionsJSON: o.options as never }); } catch (e) { throw new Error(fingerErr(e)); }
      setStep('saving');
      const r = await post('/api/att/mark', { action: 'mark', token, kind, response: resp, loc: { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy } });
      if (r.ok) { setMsg({ tone: 'good', text: String(r.msg) }); router.refresh(); }
      else { setMsg({ tone: 'bad', text: String(r.error) }); setTicket(typeof r.ticket === 'string' ? r.ticket : null); }
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }); }
    setStep('idle');
  };
  const ask = async () => {
    if (!ticket) return;
    setStep('saving');
    const r = await post('/api/att/ask', { ticket, note });
    setMsg({ tone: r.ok ? 'info' : 'bad', text: String(r.ok ? r.msg : r.error) }); if (r.ok) { setTicket(null); router.refresh(); }
    setStep('idle');
  };
  const word = step === 'loc' ? 'Finding your location…' : step === 'finger' ? 'Touch the fingerprint sensor…' : step === 'saving' ? 'Saving…' : '';
  return <div className="att-act">
    {!supported ? <div className="callout bad"><div>This browser can&apos;t use your fingerprint. Open this link in <b>Chrome</b> (Android) or <b>Safari</b> (iPhone).</div></div> : null}
    {state === 'register' ? <>
      <p className="att-p">Register this phone once. Your phone will ask for your <b>fingerprint</b> (or face, on iPhones with Face ID). Then your building manager approves it, and only this phone can check you in.</p>
      <button type="button" className="signin-btn att-big" disabled={busy || !supported} onClick={register}><span>{busy ? word : 'Register this phone'}</span></button>
    </> : next === 'done' ? <div className="callout good"><div>You have checked in and out today. See you tomorrow.</div></div> : <>
      {noArea ? <div className="callout warn"><div>Your building&apos;s office point isn&apos;t set yet, so check-ins can&apos;t be checked. Ask your manager.</div></div> : null}
      <button type="button" className={`signin-btn att-big${next === 'checkout' ? ' att-out' : ''}`} disabled={busy || !supported} onClick={() => doMark(next)}><span>{busy ? word : next === 'checkin' ? 'Check in' : 'Check out'}</span></button>
      <p className="att-p small">You must be inside the building. Your phone shares its location only now, at {next === 'checkin' ? 'check-in' : 'check-out'}.</p>
    </>}
    {pending.map(p => <div key={p} className="callout info"><div>{p}</div></div>)}
    {msg ? <div className={`callout ${msg.tone}`} role="status"><div>{msg.text}</div></div> : null}
    {ticket ? <div className="att-ask"><label htmlFor="att-note">Can&apos;t check in from inside? Ask your manager to mark you.</label>
      <input id="att-note" value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Reason (optional), e.g. at the gate cabin" />
      <button type="button" className="btn" disabled={busy} onClick={ask}>Ask manager</button></div> : null}
  </div>;
}
