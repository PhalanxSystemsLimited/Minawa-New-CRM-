'use client';
// Keeps every open CRM screen live, and pops up notifications as they happen. Every few seconds (every 30 seconds
// while the tab is in the background) it asks the server, which also starts the day's billing at 11:00 AM. The server
// answers with a revision number that changes whenever anything is saved by anyone: a payment entered or confirmed, a
// bill, an approval request, a sent message, a change in Settings… When it changes, the screen reloads its data in
// place (the bell, the counters and the lists update without a refresh), and the server sends this person's
// notifications (lib/notify.ts): the ones this browser hasn't shown yet pop up in the corner, the bell rings, and while
// the tab is in the background the tab title counts them and, if allowed, the computer shows a desktop alert.
// If you are typing in a field at that moment, the refresh waits until you leave the field.
// A notification that arrives while the window is hidden (another tab, minimised, or covered by another window) is
// kept and slides in when you come back, so it is never missed. Each one slides in at the top right, shows a bar
// counting down, stays while the mouse is over it, then slides out by itself.
// 18 Nov 2026: a short two-note chime plays when notifications arrive (once per batch). Browsers only allow sound
// after the person has clicked or typed on the page once, so until then the pop-up shows silently. The account menu
// has a Sound on/off switch (remembered in this browser: localStorage 'minawa.sound').
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Note } from '@/lib/notify';

const EVERY = 5000, HIDDEN_EVERY = 30000, SHOW_MS = 9000, OUT_MS = 380, MAX_SHOWN = 3;
type Toast = Note & { key: number; born: number; out?: number };

export function LivePayments({ counts, me }: { counts: Record<string, number>; me: string }) {
  const router = useRouter(), last = useRef(counts), rev = useRef<number | null>(null), pending = useRef(false);
  const held = useRef<Note[]>([]), hover = useRef(false);
  const [toasts, setToasts] = useState<Toast[]>([]), [more, setMore] = useState(0), [ask, setAsk] = useState(false);
  last.current = counts;
  useEffect(() => {
    let busy = false, unseen = 0, lastPoll = 0, ctx: AudioContext | null = null;
    const unlock = () => { try { if (!ctx) { const A = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (A) ctx = new A(); } if (ctx && ctx.state === 'suspended') void ctx.resume(); } catch { /* no audio here */ } };
    const chime = () => {
      try { if (localStorage.getItem('minawa.sound') === 'off') return; } catch { /* private mode: play */ }
      if (!ctx || ctx.state !== 'running') return;
      const t0 = ctx.currentTime + 0.02;
      for (const [f, at, len] of [[880, 0, 0.32], [1318.5, 0.11, 0.42]] as const) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.16, t0 + at + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        o.start(t0 + at); o.stop(t0 + at + len + 0.02);
      }
    };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    const KEY = `minawa.notes.${me}`, baseTitle = document.title.replace(/^\(\d+\) /, '');
    const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes((a as HTMLInputElement).type)) || a.isContentEditable); };
    const refresh = () => { if (typing()) { pending.current = true; return; } pending.current = false; router.refresh(); };
    const readSeen = (): string[] | null => { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
    const saveSeen = (ids: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(ids.slice(-400))); } catch { /* private mode */ } };
    const ring = () => { const b = document.querySelector('.bell-btn'); if (!b) return; b.classList.remove('ringing'); void (b as HTMLElement).offsetWidth; b.classList.add('ringing'); setTimeout(() => b.classList.remove('ringing'), 1600); };
    const show = (fresh: Note[]) => {
      if (!fresh.length) return;
      chime();
      const now = Date.now();
      setToasts(t => [...fresh.slice(0, MAX_SHOWN).map((n, i) => ({ ...n, key: now + i, born: now })), ...t.filter(x => !x.out)].slice(0, MAX_SHOWN));
      setMore(m => fresh.length > MAX_SHOWN ? m + fresh.length - MAX_SHOWN : m);
      ring();
    };
    const announce = (notes: Note[]) => {
      const seen = readSeen();
      if (!seen) { saveSeen(notes.map(n => n.id)); return; }   // first time in this browser: start from now, no flood
      const fresh = notes.filter(n => !seen.includes(n.id));
      if (!fresh.length) return;
      saveSeen([...seen, ...fresh.map(n => n.id)]);
      if (document.visibilityState === 'visible') show(fresh);
      else held.current.push(...fresh);   // shown when the window is back in view
      if ('Notification' in window && Notification.permission === 'default') setAsk(true);
      if (document.visibilityState !== 'visible') {
        unseen += fresh.length; document.title = `(${unseen}) ${baseTitle}`;
        if ('Notification' in window && Notification.permission === 'granted')
          fresh.slice(0, MAX_SHOWN).forEach(n => { try { const d = new Notification(n.title, { body: n.text, tag: n.id, icon: '/assets/minawa-mark.png' }); d.onclick = () => { window.focus(); router.push(n.href); d.close(); }; } catch { /* not allowed here */ } });
      }
    };
    const tick = async (force = false) => {
      const hidden = document.visibilityState !== 'visible';
      if (busy || (!force && hidden && Date.now() - lastPoll < HIDDEN_EVERY)) return;
      busy = true; lastPoll = Date.now();
      try {
        const r = await fetch(`/api/live?rev=${rev.current ?? -1}`, { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json() as { counts: Record<string, number>; ran?: number; rev?: number; notes?: Note[] };
          const revChanged = typeof j.rev === 'number' && rev.current !== null && j.rev !== rev.current;
          if (typeof j.rev === 'number') rev.current = j.rev;
          if (j.notes) announce(j.notes);
          const changed = revChanged || (j.ran || 0) > 0 || Object.keys(j.counts).some(k => (j.counts[k] || 0) !== (last.current[k] || 0));
          if (changed && !hidden) refresh(); else if (changed) pending.current = true;
        }
      } catch { /* offline: try again next time */ }
      busy = false;
    };
    const t = setInterval(() => tick(), EVERY), first = setTimeout(() => tick(true), 1200);
    const vis = () => { if (document.visibilityState === 'visible') { unseen = 0; document.title = baseTitle; const h = held.current.splice(0); if (h.length) show(h); if (pending.current && !typing()) refresh(); tick(true); } };
    const blur = () => { if (pending.current) setTimeout(() => { if (pending.current && !typing()) refresh(); }, 300); };
    document.addEventListener('visibilitychange', vis); window.addEventListener('focus', vis); document.addEventListener('focusout', blur);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); try { void ctx?.close(); } catch { /* closed */ } clearInterval(t); clearTimeout(first); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', vis); document.removeEventListener('focusout', blur); };
  }, [router, me]);
  // Each popup slides out by itself after SHOW_MS (not while the mouse is over the stack), or when closed.
  useEffect(() => {
    if (!toasts.length) { setMore(0); setAsk(false); return; }
    const t = setTimeout(() => {
      const now = Date.now();
      if (hover.current) { setToasts(x => x.map(n => n.out ? n : { ...n, born: n.born + 500 })); return; }
      setToasts(x => x.filter(n => !n.out || now - n.out < OUT_MS).map(n => !n.out && now - n.born > SHOW_MS ? { ...n, out: now } : n));
    }, 500);
    return () => clearTimeout(t);
  }, [toasts]);
  if (!toasts.length) return null;
  const close = (key: number) => setToasts(x => x.map(n => n.key === key && !n.out ? { ...n, out: Date.now() } : n));
  return <div className="ntf-stack" role="status" aria-live="polite" onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; }}>
    {toasts.map(n => <div key={n.key} className={`ntf ntf-${n.tone}${n.out ? ' ntf-out' : ''}`} style={{ ['--ntf-life' as string]: `${SHOW_MS}ms` }}>
      <span className="ntf-dot" aria-hidden="true"></span>
      <a className="ntf-t" href={n.href} onClick={e => { e.preventDefault(); close(n.key); router.push(n.href); }}><b>{n.title}</b><span>{n.text}</span></a>
      <button type="button" className="ntf-x" aria-label="Close" onClick={() => close(n.key)}>×</button>
      <span className="ntf-life" aria-hidden="true"></span>
    </div>)}
    {more ? <div className="ntf-more">+{more} more · <a href="/tasks" onClick={() => setMore(0)}>see your To do</a></div> : null}
    {ask ? <div className="ntf-more"><button type="button" className="link-btn" onClick={() => { setAsk(false); try { Notification.requestPermission(); } catch { /* old browser */ } }}>Turn on desktop alerts</button> so you hear about these when the CRM is in the background.</div> : null}
  </div>;
}
