'use client';
// A thin bar across the top while a page is on its way (18 Nov 2026): it starts when a link or button that opens a
// page is clicked, or a form is sent, and finishes the moment the new page is on screen. Background refreshes (live
// updates) don't show it. If the page takes more than a moment, a small loader (the Minawa mark breathing) fades in
// over the page area, and it is gone the moment the new page is on screen. Opening another page shows that page's
// skeleton instead (update 123, loading.tsx), so the small loader is kept for filters on the same page and forms.
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function NavProgress() {
  const path = usePathname(), search = useSearchParams(), [state, setState] = useState<'idle' | 'run' | 'done'>('idle'), [veil, setVeil] = useState(true), stop = useRef<number>(0);
  useEffect(() => {
    const start = (v = true) => { window.clearTimeout(stop.current); setVeil(v); setState('run'); stop.current = window.setTimeout(() => setState('idle'), 15000); };
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('a[href], [data-href]'); if (!el) return;
      const href = el.getAttribute('data-href') || el.getAttribute('href') || '';
      if (!href || href.startsWith('#') || el.getAttribute('target') === '_blank' || el.hasAttribute('download') || /^(https?:|mailto:|tel:|whatsapp:)/.test(href) || href.startsWith('/api/') || href.startsWith('/d/')) return;
      const u = new URL(href, location.href); if (u.pathname + u.search === location.pathname + location.search) return;
      start(u.pathname === location.pathname);
    };
    const submit = (e: SubmitEvent) => { const f = e.target as HTMLFormElement; if (!f.closest('[data-no-progress]')) start(); };
    document.addEventListener('click', click, true); document.addEventListener('submit', submit, true);
    return () => { document.removeEventListener('click', click, true); document.removeEventListener('submit', submit, true); };
  }, []);
  useEffect(() => { setState(s => s === 'run' ? 'done' : s); window.clearTimeout(stop.current); const t = window.setTimeout(() => setState('idle'), 450); return () => window.clearTimeout(t); }, [path, search]);
  return <>
    <div className={`nav-prog ${state}`} aria-hidden="true"><i></i></div>
    <div className={`nav-veil ${veil ? state : 'idle'}`} role="status" aria-live="polite" aria-hidden={state !== 'run'}>
      <span className="pg-load-mark"><img src="/assets/minawa-mark.png" alt="" /></span>
      <span className="pg-load-bar" aria-hidden="true"><i></i></span>
      <span className="pg-load-t">{state === 'run' ? 'Loading…' : ''}</span>
    </div>
  </>;
}
