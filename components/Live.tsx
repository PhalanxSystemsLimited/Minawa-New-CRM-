'use client';
// The "live" layer (Nov 2026): a slowly moving aurora behind the app, numbers that count up, a light that follows the
// pointer over cards, a gentle tilt on the dashboard tiles, a ripple on buttons, and a highlight that slides between
// tabs. Everything is skipped for people whose device asks for reduced motion; tilt and the pointer light only run
// with a mouse (not on touch screens).
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** Counts [data-count] numbers up from 0 the first time they are seen; the final text is the server's text. */
function countUp(root: ParentNode) {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-count]:not([data-counted])'));
  if (!els.length) return () => {};
  const run = (el: HTMLElement) => {
    el.setAttribute('data-counted', '1');
    // Animate the existing text node (React keeps owning it), and stop if React updates the number meanwhile.
    const node = el.firstChild, to = +(el.dataset.count || 0), key = el.dataset.count;
    if (!node || node.nodeType !== 3 || !to || reduced()) return;
    const final = node.nodeValue || '', m = final.match(/^(\D*)([\d,]+)(.*)$/s);
    if (!m) return;
    const [, pre, , post] = m, t0 = performance.now(), ms = 900 + Math.min(600, String(to).length * 60);
    const step = (t: number) => {
      if (el.dataset.count !== key || node.parentNode !== el) return;
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      node.nodeValue = k < 1 ? `${pre}${Math.round(to * e).toLocaleString('en-US')}${post}` : final;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); run(e.target as HTMLElement); } }), { threshold: .3 });
  els.forEach(el => io.observe(el));
  return () => io.disconnect();
}

/** The dark highlight slides from tab to tab instead of jumping. */
function tabInk() {
  const bars = Array.from(document.querySelectorAll<HTMLElement>('.proj-tabs'));
  const offs: (() => void)[] = [];
  bars.forEach(bar => {
    let ink = bar.querySelector<HTMLElement>(':scope > .tab-ink');
    if (!ink) { ink = document.createElement('span'); ink.className = 'tab-ink'; ink.setAttribute('aria-hidden', 'true'); bar.prepend(ink); }
    const place = (b: HTMLElement | null, instant = false) => {
      if (!b || !ink) return;
      // The tab under the dark highlight gets the white text, so the text never sits white-on-white while the next page loads.
      bar.querySelectorAll('button.ink-on').forEach(x => { if (x !== b) x.classList.remove('ink-on'); });
      b.classList.add('ink-on');
      if (instant) ink.style.transition = 'none';
      ink.style.width = b.offsetWidth + 'px'; ink.style.transform = `translateX(${b.offsetLeft}px)`; ink.style.height = b.offsetHeight + 'px'; ink.style.top = b.offsetTop + 'px';
      ink.style.opacity = '1';
      if (instant) { void ink.offsetWidth; ink.style.transition = ''; }
    };
    const cur = () => bar.querySelector<HTMLElement>('button[aria-current="page"]');
    // Start from where the previous page's tab was (kept across navigations), then slide to the current one.
    const prev = sessionStorage.getItem('minawa.tabInk');
    if (prev) { const [x, w] = prev.split(':'); ink.style.transition = 'none'; ink.style.transform = `translateX(${x}px)`; ink.style.width = w + 'px'; void ink.offsetWidth; ink.style.transition = ''; }
    requestAnimationFrame(() => place(cur(), !prev));
    bar.classList.add('has-ink');
    const down = (e: Event) => { const b = (e.target as HTMLElement).closest('button'); if (b && bar.contains(b)) { place(b as HTMLElement); try { sessionStorage.setItem('minawa.tabInk', `${b.offsetLeft}:${b.offsetWidth}`); } catch { /* private mode */ } } };
    const rs = () => place(cur(), true);
    bar.addEventListener('pointerdown', down); window.addEventListener('resize', rs);
    offs.push(() => { bar.removeEventListener('pointerdown', down); window.removeEventListener('resize', rs); });
  });
  return () => offs.forEach(f => f());
}

const LIT = '.card,.pcard,.lv-need,.lv-kpi,.lv-lane,.kpi,.apv,.hs';
const TILT = '.lv-kpi';

export function LiveEffects() {
  const path = usePathname();
  // Per page: count-ups and the tab highlight.
  useEffect(() => {
    // On laptops the page scrolls inside the rounded app window: start each new page at its top.
    const sh = document.querySelector<HTMLElement>('.shell');
    if (sh && sh.scrollHeight > sh.clientHeight && getComputedStyle(sh).overflowY !== 'visible') sh.scrollTop = 0;
    const main = document.getElementById('main') || document.body;
    let stopCount = countUp(main);
    const mo = new MutationObserver(() => { stopCount(); stopCount = countUp(main); });
    mo.observe(main, { childList: true, subtree: true });
    const stopInk = reduced() ? () => {} : tabInk();
    try { if (!document.querySelector('.proj-tabs')) sessionStorage.removeItem('minawa.tabInk'); } catch { /* ignore */ }
    return () => { mo.disconnect(); stopCount(); stopInk(); };
  }, [path]);
  // Once: pointer light, tilt and button ripple (delegated, so it works for every page).
  useEffect(() => {
    if (reduced()) return;
    const fine = finePointer();
    let lit: HTMLElement | null = null, raf = 0;
    const move = (e: PointerEvent) => {
      if (!fine) return;
      const el = (e.target as HTMLElement)?.closest?.(LIT) as HTMLElement | null;
      if (lit && lit !== el) { lit.classList.remove('is-lit'); lit.style.removeProperty('--tilt-x'); lit.style.removeProperty('--tilt-y'); }
      lit = el;
      if (!el) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`); el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        el.classList.add('is-lit');
        if (el.matches(TILT)) { el.style.setProperty('--tilt-x', `${((.5 - y) * 6).toFixed(2)}deg`); el.style.setProperty('--tilt-y', `${((x - .5) * 8).toFixed(2)}deg`); }
      });
    };
    const leave = () => { if (lit) { lit.classList.remove('is-lit'); lit.style.removeProperty('--tilt-x'); lit.style.removeProperty('--tilt-y'); lit = null; } };
    const ripple = (e: PointerEvent) => {
      const b = (e.target as HTMLElement)?.closest?.('.btn,.lv-need,.mbar-i,.proj-tabs button') as HTMLElement | null;
      if (!b || (b as HTMLButtonElement).disabled) return;
      const r = b.getBoundingClientRect(), s = document.createElement('span');
      s.className = 'lv-ripple'; s.style.left = `${e.clientX - r.left}px`; s.style.top = `${e.clientY - r.top}px`;
      if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
      b.classList.add('lv-rippling'); b.appendChild(s); setTimeout(() => s.remove(), 650);
    };
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    document.addEventListener('pointerdown', ripple, { passive: true });
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); document.removeEventListener('pointerdown', ripple); };
  }, []);
  return <div className="lv-aurora" aria-hidden="true"><i className="a1"></i><i className="a2"></i><i className="a3"></i></div>;
}

/** Tabs whose panels are already on the page; switching just shows another panel. */
export function LiveTabs({ tabs }: { tabs: { key: string; label: string; badge?: number; body: React.ReactNode }[] }) {
  const [on, setOn] = useState(tabs[0]?.key);
  return <>
    <div className="lv-tabs" role="tablist">{tabs.map(t => <button key={t.key} type="button" role="tab" aria-selected={on === t.key} className={on === t.key ? 'on' : ''} onClick={() => setOn(t.key)}>{t.label}{t.badge ? <i>{t.badge}</i> : null}</button>)}</div>
    {tabs.map(t => <div key={t.key} role="tabpanel" hidden={on !== t.key} className="lv-tabpanel">{t.body}</div>)}
  </>;
}
