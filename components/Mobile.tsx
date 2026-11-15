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

/** Bottom bar on phones: Home, Apartments, To do, Send, More (More opens the full menu with every page). */
export function MobileBar({ projects, defaultPid }: { projects: NavProject[]; defaultPid: string }) {
  const path = usePathname();
  const pid = path.startsWith('/p/') ? path.split('/')[2] : defaultPid;
  const p = projects.find(x => x.id === pid), base = `/p/${pid}`;
  const on = (s: string) => path === s || path.startsWith(s + '/');
  const items: [string, string, string, boolean, number][] = [
    ['home', 'Home', '/', path === '/', 0],
    ['users', 'Apartments', `${base}/apartments`, on(`${base}/apartments`), 0],
    ['check', 'To do', `${base}/todo`, on(`${base}/todo`), p?.todo || 0],
    ['phone', 'Send', `${base}/send`, on(`${base}/send`), 0]
  ];
  // More is lit on the pages only it leads to (WhatsApp, Approvals, Activity, Staff); project pages have their tab row.
  const elsewhere = !path.startsWith('/p/') && !items.some(i => i[3]);
  return <nav className="mbar" aria-label="Quick menu">
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
    run();
    let q = 0;
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
