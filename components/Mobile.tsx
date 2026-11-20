'use client';
// Phone layout helpers (screens under 768px). Nothing here changes laptops or PCs: the bottom bar and the "Show more"
// button are hidden there by CSS, and the table labels and hidden rows are only added on phones.
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Ic } from './icons';
import { Go } from './client';
import type { NavProject } from './Shell';

const PHONE = '(max-width: 767px)';
const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.(PHONE).matches;

/** Bottom bar on phones: Home, Apartments, To do, Send (Payments for the Admin and Accountant), More (More opens the full menu with every page). */
export function MobileBar({ projects, defaultPid, manager = false }: { projects: NavProject[]; defaultPid: string; manager?: boolean }) {
  const path = usePathname();
  const pid = path.startsWith('/p/') ? path.split('/')[2] : defaultPid;
  const p = projects.find(x => x.id === pid), base = `/p/${pid}`;
  const on = (s: string) => path === s || path.startsWith(s + '/');
  const items: [string, string, string, boolean, number][] = [
    ['home', 'Home', '/', path === '/', 0],
    ['users', 'Apartments', `${base}/apartments`, on(`${base}/apartments`), 0],
    ['check', 'To do', '/tasks', on('/tasks') || on(`${base}/todo`), projects.reduce((a, x) => a + (x.todo || 0), 0)],
    manager ? ['phone', 'Send', `${base}/send`, on(`${base}/send`), 0] : ['wallet', 'Payments', `${base}/payments`, on(`${base}/payments`), 0]
  ];
  // More is lit on the pages only it leads to (WhatsApp, Approvals, Activity, Staff); project pages have their tab row.
  const elsewhere = !path.startsWith('/p/') && !items.some(i => i[3]);
  // Keep the bar on the bottom edge of what is actually on screen. On phones the browser's own bars (address bar,
  // the strip above the gesture bar) grow and shrink while scrolling, and for a moment the page's bottom edge is
  // under them; the bar is lifted by that much so it is never cut off.
  const bar = useRef<HTMLElement>(null);
  useEffect(() => {
    const vv = window.visualViewport, el = bar.current;
    if (!vv || !el) return;
    let raf = 0;
    const fit = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      if (vv.scale > 1.01) { el.style.removeProperty('--mbar-lift'); return; }   // zoomed in: leave it where it is
      const hidden = Math.round(window.innerHeight - (vv.height + vv.offsetTop));
      if (hidden > 0 && hidden < 200) el.style.setProperty('--mbar-lift', hidden + 'px'); else el.style.removeProperty('--mbar-lift');
    }); };
    fit();
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); window.addEventListener('scroll', fit, { passive: true });
    return () => { cancelAnimationFrame(raf); vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); window.removeEventListener('scroll', fit); };
  }, []);
  return <nav className="mbar" aria-label="Quick menu" ref={bar}>
    {items.map(([ic, l, href, cur, n]) => <Go key={l} href={href} className="mbar-i" current={cur}><span className="mbar-ic"><Ic n={ic} s={22} />{n ? <span className="mbar-b">{n > 99 ? '99+' : n}</span> : null}</span><span className="mbar-l">{l}</span></Go>)}
    <button type="button" className="mbar-i" data-a="side-open" aria-current={elsewhere ? 'page' : undefined} aria-label="More: every page and project"><span className="mbar-ic"><Ic n="menu" s={22} /></span><span className="mbar-l">More</span></button>
  </nav>;
}

/** On phones, tables become cards: each cell gets its column name as a label. Also keeps the current project tab in
 *  view in the scrolling tab row. Runs again whenever the page content changes. */
export function MobileTables() {
  const path = usePathname();
  useEffect(() => {
    const main = document.getElementById('main');
    if (!main) return;
    const run = () => {
      if (!isPhone()) return;
      main.querySelectorAll<HTMLTableElement>('.tbl-wrap > table:not(.m-keep)').forEach(t => {
        // A table still streaming in (React hasn't taken it over yet) is done on the next pass (update 124).
        if (!Object.keys(t).some(k => k.startsWith('__reactFiber$'))) { cancelAnimationFrame(q); q = requestAnimationFrame(run); return; }
        const heads: string[] = [];
        t.querySelectorAll('thead th').forEach(th => { const span = (th as HTMLTableCellElement).colSpan || 1; const txt = (th.textContent || '').replace(/[^\p{L}\p{N}\s()&'.,/%-]/gu, '').trim(); for (let i = 0; i < span; i++) heads.push(txt); });
        t.setAttribute('data-m', 'stack');
        t.querySelectorAll('tbody tr, tfoot tr').forEach(tr => {
          const cells = Array.from(tr.children) as HTMLTableCellElement[];
          if (cells.length === 1 || (cells.length <= 2 && cells.some(c => c.colSpan > 2))) tr.setAttribute('data-m', 'span');
          let col = 0;
          cells.forEach(c => { const l = heads[col]; if (l && !c.hasAttribute('data-l')) c.setAttribute('data-l', l); if (!(c.textContent || '').trim() && !c.querySelector('input,select,button,a,img,svg')) c.setAttribute('data-m', 'empty'); col += c.colSpan || 1; });
        });
      });
      const tab = document.querySelector<HTMLElement>('.proj-tabs [aria-current="page"]');
      const row = tab?.parentElement;
      if (tab && row && row.scrollWidth > row.clientWidth) row.scrollLeft = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2;
    };
    let q = 0;
    run();
    const mo = new MutationObserver(() => { cancelAnimationFrame(q); q = requestAnimationFrame(run); });
    mo.observe(main, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(q); };
  }, [path]);
  return null;
}

/** On phones, long lists show `step` items at a time with a "Show more" button. On laptops and PCs nothing is hidden
 *  and the button isn't shown. Put it right after the list. */
export function PhoneMore({ step = 50, what = 'entries' }: { step?: number; what?: string }) {
  const ref = useRef<HTMLDivElement>(null), [shown, setShown] = useState(step), [total, setTotal] = useState(0);
  useEffect(() => {
    const prev = ref.current?.previousElementSibling;
    const list = prev?.classList.contains('tbl-wrap') ? prev.querySelector('tbody') : prev;   // a table: its rows
    if (!list) return;
    const kids = Array.from(list.children);
    setTotal(kids.length);
    kids.forEach((k, i) => { if (isPhone() && i >= shown) k.setAttribute('data-m', 'hide'); else if (k.getAttribute('data-m') === 'hide') k.removeAttribute('data-m'); });
  });   // after every render: the list changes when filters change
  const left = total - shown;
  return <div ref={ref} className="m-more">{left > 0 ? <button type="button" className="btn" onClick={() => setShown(s => s + step)}>Show {Math.min(step, left)} more {what} <span className="muted">({left} left)</span></button> : null}</div>;
}

/** Phones: when a row of tabs is wider than the screen, small arrow buttons on its ends scroll it left and right.
 *  The tabs themselves stay as they are; the arrows only show on small screens and only when there is more to see. */
export function TabScroller({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null), [l, setL] = useState(false), [r, setR] = useState(false);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.proj-tabs, nav, [role="tablist"]');
    if (!el) return;
    const upd = () => { setL(el.scrollLeft > 4); setR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4); };
    // start with the open tab in view
    const on = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (on && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);
    upd();
    el.addEventListener('scroll', upd, { passive: true }); window.addEventListener('resize', upd);
    return () => { el.removeEventListener('scroll', upd); window.removeEventListener('resize', upd); };
  }, []);
  const go = (dir: number) => { const el = box.current?.querySelector<HTMLElement>('.proj-tabs, nav, [role="tablist"]'); el?.scrollBy({ left: dir * el.clientWidth * .6, behavior: 'smooth' }); };
  return <div className={`tab-scroll${l ? ' can-l' : ''}${r ? ' can-r' : ''}`} ref={box}>
    <button type="button" className="ts-btn ts-l" aria-label="Show earlier tabs" tabIndex={l ? 0 : -1} onClick={() => go(-1)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg></button>
    {children}
    <button type="button" className="ts-btn ts-r" aria-label="Show more tabs" tabIndex={r ? 0 : -1} onClick={() => go(1)}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></button>
  </div>;
}
