'use client';
// Keeps the CRM live: every 30 seconds (while the tab is open and visible) it asks the server, which also checks
// Safepay for new payments. When a project's count of new payments changes, the screen refreshes so the red badges
// on Payments and in the menu show it.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function LivePayments({ counts }: { counts: Record<string, number> }) {
  const router = useRouter(), last = useRef(counts);
  last.current = counts;
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const r = await fetch('/api/live', { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json() as { counts: Record<string, number>; recorded: number; ran?: number };
          const changed = j.recorded > 0 || (j.ran || 0) > 0 || Object.keys(j.counts).some(k => (j.counts[k] || 0) !== (last.current[k] || 0));
          if (changed) router.refresh();
        }
      } catch { /* offline: try again next time */ }
      busy = false;
    };
    const t = setInterval(tick, 30000), first = setTimeout(tick, 5000);
    const vis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); clearTimeout(first); document.removeEventListener('visibilitychange', vis); };
  }, [router]);
  return null;
}
