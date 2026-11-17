'use client';
// Keeps every open CRM screen live. Every few seconds (while the tab is visible, and straight away when you come back
// to it) it asks the server, which also checks Safepay for new payments and starts the day's billing at 11:00 AM.
// The server answers with a revision number that changes whenever anything is saved by anyone: a payment (Safepay or
// recorded by hand), a bill, a sent message, a change in Settings… When it changes, the screen reloads its data in
// place. If you are typing in a field at that moment, the refresh waits until you leave the field.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const EVERY = 8000;

export function LivePayments({ counts }: { counts: Record<string, number> }) {
  const router = useRouter(), last = useRef(counts), rev = useRef<number | null>(null), pending = useRef(false);
  last.current = counts;
  useEffect(() => {
    let busy = false;
    const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes((a as HTMLInputElement).type)) || a.isContentEditable); };
    const refresh = () => { if (typing()) { pending.current = true; return; } pending.current = false; router.refresh(); };
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const r = await fetch('/api/live', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json() as { counts: Record<string, number>; recorded: number; ran?: number; rev?: number };
          const revChanged = typeof j.rev === 'number' && rev.current !== null && j.rev !== rev.current;
          if (typeof j.rev === 'number') rev.current = j.rev;
          const changed = revChanged || j.recorded > 0 || (j.ran || 0) > 0 || Object.keys(j.counts).some(k => (j.counts[k] || 0) !== (last.current[k] || 0));
          if (changed) refresh();
        }
      } catch { /* offline: try again next time */ }
      busy = false;
    };
    const t = setInterval(tick, EVERY), first = setTimeout(tick, 1500);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    const blur = () => { if (pending.current) setTimeout(() => { if (pending.current && !typing()) refresh(); }, 300); };
    document.addEventListener('visibilitychange', vis); window.addEventListener('focus', vis); document.addEventListener('focusout', blur);
    return () => { clearInterval(t); clearTimeout(first); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', vis); document.removeEventListener('focusout', blur); };
  }, [router]);
  return null;
}
