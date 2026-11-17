'use client';
// Keeps every open CRM screen live, and pops up notifications as they happen. Every few seconds (every 30 seconds
// while the tab is in the background) it asks the server, which also starts the day's billing at 11:00 AM. The server
// answers with a revision number that changes whenever anything is saved by anyone: a payment entered or confirmed, a
// bill, an approval request, a sent message, a change in Settings… When it changes, the screen reloads its data in
// place (the bell, the counters and the lists update without a refresh), and the server sends this person's
// notifications (lib/notify.ts): the ones this browser hasn't shown yet pop up in the corner, the bell rings, and while
// the tab is in the background the tab title counts them and, if allowed, the computer shows a desktop alert.
// If you are typing in a field at that moment, the refresh waits until you leave the field.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Note } from '@/lib/notify';

const EVERY = 5000, HIDDEN_EVERY = 30000, SHOW_MS = 14000, MAX_SHOWN = 3;

export function LivePayments({ counts, me }: { counts: Record<string, number>; me: string }) {
  const router = useRouter(), last = useRef(counts), rev = useRef<number | null>(null), pending = useRef(false);
  const [toasts, setToasts] = useState<(Note & { key: number })[]>([]), [more, setMore] = useState(0), [ask, setAsk] = useState(false);
  last.current = counts;
  useEffect(() => {
    let busy = false, unseen = 0, lastPoll = 0;
    const KEY = `minawa.notes.${me}`, baseTitle = document.title.replace(/^\(\d+\) /, '');
    const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes((a as HTMLInputElement).type)) || a.isContentEditable); };
    const refresh = () => { if (typing()) { pending.current = true; return; } pending.current = false; router.refresh(); };
    const readSeen = (): string[] | null => { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } };
    const saveSeen = (ids: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(ids.slice(-400))); } catch { /* private mode */ } };
    const ring = () => { const b = document.querySelector('.bell-btn'); if (!b) return; b.classList.remove('ringing'); void (b as HTMLElement).offsetWidth; b.classList.add('ringing'); setTimeout(() => b.classList.remove('ringing'), 1600); };
    const announce = (notes: Note[]) => {
      const seen = readSeen();
      if (!seen) { saveSeen(notes.map(n => n.id)); return; }   // first time in this browser: start from now, no flood
      const fresh = notes.filter(n => !seen.includes(n.id));
      if (!fresh.length) return;
      saveSeen([...seen, ...fresh.map(n => n.id)]);
      const now = Date.now();
      setToasts(t => [...fresh.slice(0, MAX_SHOWN).map((n, i) => ({ ...n, key: now + i })), ...t].slice(0, MAX_SHOWN));
      setMore(m => fresh.length > MAX_SHOWN ? m + fresh.length - MAX_SHOWN : m);
      ring();
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
    const vis = () => { if (document.visibilityState === 'visible') { unseen = 0; document.title = baseTitle; if (pending.current && !typing()) refresh(); tick(true); } };
    const blur = () => { if (pending.current) setTimeout(() => { if (pending.current && !typing()) refresh(); }, 300); };
    document.addEventListener('visibilitychange', vis); window.addEventListener('focus', vis); document.addEventListener('focusout', blur);
    return () => { clearInterval(t); clearTimeout(first); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', vis); document.removeEventListener('focusout', blur); };
  }, [router, me]);
  // Each popup closes by itself after a while (or when clicked away).
  useEffect(() => {
    if (!toasts.length) { setMore(0); setAsk(false); return; }
    const t = setTimeout(() => setToasts(x => x.filter(n => Date.now() - n.key < SHOW_MS)), 1000);
    return () => clearTimeout(t);
  }, [toasts]);
  if (!toasts.length) return null;
  const close = (key: number) => setToasts(x => x.filter(n => n.key !== key));
  return <div className="ntf-stack" role="status" aria-live="polite">
    {toasts.map(n => <div key={n.key} className={`ntf ntf-${n.tone}`}>
      <span className="ntf-dot" aria-hidden="true"></span>
      <a className="ntf-t" href={n.href} onClick={e => { e.preventDefault(); close(n.key); router.push(n.href); }}><b>{n.title}</b><span>{n.text}</span></a>
      <button type="button" className="ntf-x" aria-label="Close" onClick={() => close(n.key)}>×</button>
    </div>)}
    {more ? <div className="ntf-more">+{more} more · <a href="/tasks" onClick={() => setMore(0)}>see your To do</a></div> : null}
    {ask ? <div className="ntf-more"><button type="button" className="link-btn" onClick={() => { setAsk(false); try { Notification.requestPermission(); } catch { /* old browser */ } }}>Turn on desktop alerts</button> so you hear about these when the CRM is in the background.</div> : null}
  </div>;
}
