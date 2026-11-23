'use client';
// Small client pieces for Attendance (23 Nov 2026): copy a link, take the office point from this device's location,
// and clear the Attendance notification counter when the screen is open.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function CopyBtn({ text, label = 'Copy link', className = 'btn sm primary' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch { /* nothing more to try */ } t.remove(); }
    setDone(true); setTimeout(() => setDone(false), 1800);
  };
  return <button type="button" className={className} onClick={copy} aria-live="polite">{done ? 'Copied ✓' : label}</button>;
}

/** Fills the office point form from this device's location (stand in the middle of the building). */
export function HereBtn({ form }: { form: string }) {
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false);
  const go = () => {
    if (!navigator.geolocation) { setMsg('This browser can\'t share its location.'); return; }
    setBusy(true); setMsg('Finding this device\'s location…');
    navigator.geolocation.getCurrentPosition(p => {
      const f = document.getElementById(form) as HTMLFormElement | null; if (!f) return;
      (f.elements.namedItem('point') as HTMLInputElement).value = `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`;
      setMsg(`Got it: accurate to ±${Math.round(p.coords.accuracy)} m. ${p.coords.accuracy > 50 ? 'That is rough: try again near a window or outside, or paste the point from Google Maps.' : 'Press Save to keep it.'}`); setBusy(false);
    }, e => { setMsg(e.code === 1 ? 'Location is blocked for this site in the browser. Allow it, or paste the point instead.' : 'Couldn\'t find the location. Try again, or paste the point instead.'); setBusy(false); }, { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  };
  return <><button type="button" className="btn sm" onClick={go} disabled={busy}>Use my current location</button>{msg ? <span className="cell-sub" role="status">{msg}</span> : null}</>;
}

/** On the Attendance screens: the notification counter is cleared while the person is looking. */
export function AttSeen({ unseen }: { unseen: number }) {
  const router = useRouter(), sent = useRef(-1);
  useEffect(() => {
    if (sent.current === unseen && unseen === 0) return;
    if (unseen === 0 && sent.current !== -1) return;
    sent.current = unseen;
    void fetch('/api/att/seen', { method: 'POST' }).then(r => { if (r.ok && unseen > 0) router.refresh(); }).catch(() => undefined);
  }, [unseen, router]);
  return null;
}
