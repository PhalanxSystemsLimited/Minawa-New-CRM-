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
    let wrote: string | null = null;
    const step = (t: number) => {
      // Stop if React has changed the number meanwhile (its attribute, or the text itself).
      if (el.dataset.count !== key || node.parentNode !== el || (wrote !== null && node.nodeValue !== wrote)) return;
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4);
      node.nodeValue = wrote = k < 1 ? `${pre}${Math.round(to * e).toLocaleString('en-US')}${post}` : final;
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

/** Table headings get a small icon that fits the column (set as an attribute, so React keeps owning the text). */
const HEAD_ICONS: [RegExp, string][] = [
  [/^(when|date|time|period|last month|last active|month|from|since|bill|due)\b/, 'cal'], [/access/, 'build'], [/apartment|flat type|^flats?\b|^to$|^apt/, 'home'],
  [/owner|sent by|^by$|name|staff|who/, 'user'], [/project/, 'build'], [/status|state/, 'pulse'], [/message|notice|text|note|event/, 'msg'],
  [/receipt/, 'card'], [/received|method|via|source/, 'bank'], [/unit|electric|generator|kwh/, 'bolt'], [/email/, 'mail'], [/role/, 'shield'],
  [/%|percent|paid %/, 'pct'], [/balance|amount|owes|outstanding|fee|rate|subtotal|total|paid|rs\b|price|charge|collected/, 'cash'],
];
function tagHeads(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('.tbl-wrap thead th:not([data-ic])').forEach(th => {
    const t = (th.textContent || '').trim().toLowerCase();
    const hit = t ? HEAD_ICONS.find(([re]) => re.test(t)) : null;
    th.setAttribute('data-ic', hit ? hit[1] : '');
  });
}

/** Card headings get an icon that fits what the card is about (an attribute, like the table headings above). The first
 *  match wins, so the more specific words come first. */
const CARD_ICONS: [RegExp, string, string][] = [
  [/reject|problem|not cleared|blocked/, 'ban', 'red'], [/what is owed|owed|owing/, 'coins', 'rust'], [/past (their )?due|overdue|defaulter|late|who owes|still unpaid|owes/, 'alert', 'red'],
  [/approv|request|change/, 'shieldok', 'amber'], [/to do|task|pending/, 'clip', 'rust'], [/possession|keys?\b/, 'key', 'violet'],
  [/reconcil|hand-?over|handed|deposit/, 'swap', 'violet'], [/receipt|voucher|statement|certificate|document/, 'receipt', 'blue'],
  [/electric|meter|units|utility/, 'bolt', 'amber'], [/generator/, 'fuel', 'teal'], [/whatsapp|message|send|sent|announce|notice/, 'send', 'green'],
  [/history|activity|log|what happened|happened/, 'history', 'violet'], [/coming up|schedule|calendar|cycle|billing|next/, 'cal', 'blue'],
  [/collect|received|payment|paid|cash|money/, 'cash', 'green'], [/staff|team|login|people|who\b|manager|accountant/, 'users', 'blue'], [/bank|account/, 'bank', 'blue'],
  [/fine|discount|rate|fee|%/, 'percent', 'violet'], [/bill|charge|dues|figures|maintenance by|total/, 'file', 'blue'],
  [/report|month|by day|by building|projects?|side by side/, 'chart', 'blue'], [/building|apartment|flat|customer|owner|contact|profile/, 'door', 'rust'],
  [/setting|rule|set up|import|connection/, 'gear', 'slate'], [/note/, 'edit', 'slate'],
];
function tagCards(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('.card-row > h3:not([data-hic]), .card > h3:not([data-hic]), .card-h > h3:not([data-hic])').forEach(h => {
    if (h.querySelector('.ico,.ic-tile,svg') || h.closest('.bs-card,.doc')) { h.setAttribute('data-hic', ''); return; }
    const own = Array.from(h.childNodes).filter(n => n.nodeType === 3 || (n as HTMLElement).tagName !== 'SMALL').map(n => n.textContent || '').join(' ').trim().toLowerCase();
    const hit = own ? CARD_ICONS.find(([re]) => re.test(own)) : null;
    // Every card title gets an icon: a plain one when no word matches.
    h.setAttribute('data-hic', hit ? hit[1] : own ? 'layers' : ''); if (hit || own) h.setAttribute('data-tone', hit ? hit[2] : 'slate');
  });
}

/** The bar behind a card's title (when the title row is the first thing shown in the card): marks the card with its
 *  colour and measures the bar, so it fits any padding and a title that wraps. --hb is the bar's height; --hg the
 *  space above the title row. */
function sizeBars(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('.card > .card-row > h3[data-tone], .card > .card-h > h3[data-tone], .card > h3[data-tone]').forEach(h => {
    const row = h.parentElement!.classList.contains('card') ? h : h.parentElement!, card = row.parentElement as HTMLElement;
    if (card.classList.contains('bs-card') || !row.offsetHeight) return;
    const first = Array.from(card.children).find(c => (c as HTMLElement).offsetHeight > 0 && c.tagName !== 'INPUT');
    if (first !== row) return;
    const tone = h.getAttribute('data-tone') || 'slate';
    if (card.getAttribute('data-bar') !== tone) card.setAttribute('data-bar', tone);
    if (!row.hasAttribute('data-barrow')) row.setAttribute('data-barrow', '');
    // A title row with its own padding (card without padding) starts at the top: the bar is the row itself.
    const top = row.offsetTop, own = top < 4, hb = `${own ? row.offsetHeight : top * 2 + row.offsetHeight}px`, hg = `${own ? -16 : top}px`;
    if (card.style.getPropertyValue('--hb') !== hb) card.style.setProperty('--hb', hb);
    if (card.style.getPropertyValue('--hg') !== hg) card.style.setProperty('--hg', hg);
  });
}

/** Plain figures in the figure boxes count up like the dashboard's (the server's text stays the final text). */
function tagFigures(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('.kpi > .v:not([data-count]):not([data-nocount])').forEach(v => {
    const t = v.childNodes.length === 1 && v.firstChild?.nodeType === 3 ? (v.textContent || '').trim() : '';
    const m = t.match(/^(?:Rs\s?)?([\d,]+)$/);
    if (m && +m[1].replace(/,/g, '') > 0) v.setAttribute('data-count', m[1].replace(/,/g, '')); else v.setAttribute('data-nocount', '');
  });
}

/** Blocks further down the page fade up as they scroll into view (the ones on screen at the start rise in as before). */
function reveal(main: HTMLElement) {
  if (reduced() || !('IntersectionObserver' in window)) return () => {};
  // The page's own blocks, and the blocks inside the dashboard's columns and the report pages (which are one tall block).
  const vh = window.innerHeight, blocks = [...Array.from(main.children), ...Array.from(main.querySelectorAll(':scope > .lv-layout > * > *, :scope > .rpt > *'))];
  const wait = blocks.filter(el => el.id !== 'modal' && !el.classList.contains('wa-ask') && !el.querySelector(':scope > .px-wait') && el.getBoundingClientRect().top > vh * 1.05) as HTMLElement[];
  if (!wait.length) return () => {};
  const show = (el: Element) => { el.classList.remove('px-wait'); el.classList.add('px-in'); };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); show(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  wait.forEach(el => { el.classList.add('px-wait'); io.observe(el); });
  const all = () => wait.forEach(show);   // printing, or anything that needs the whole page
  window.addEventListener('beforeprint', all);
  return () => { io.disconnect(); window.removeEventListener('beforeprint', all); wait.forEach(el => el.classList.remove('px-wait')); };
}

const LIT = '.card,.pcard,.lv-need,.lv-kpi,.lv-lane,.kpi,.apv,.hs';
const TILT = '.lv-tilt'; // nothing tilts now: a 3D tilt made the browser blur the icons inside

/** Big figures (Rs 38,498,356) stay inside their boxes at any zoom or screen scaling: a figure wider than its box is
 *  scaled down (with its small print) just enough to fit, and scaled back up when there is room again. */
const FIT = '.lv-kpi .v, .kpi .v, .lv-target .v, .lv-pre b, .lv-money-rt b, .lv-next-r b';
function fitText(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(FIT).forEach(el => {
    const parts = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))];
    parts.forEach(x => { x.style.fontSize = ''; });
    if (!el.clientWidth || el.scrollWidth - el.clientWidth <= 1) return;
    const base = parts.map(x => parseFloat(getComputedStyle(x).fontSize));
    let r = 1;
    for (let i = 0; i < 6 && el.scrollWidth - el.clientWidth > 1 && r > .5; i++) {
      r = Math.max(.5, r * (el.clientWidth / el.scrollWidth) * .985);
      parts.forEach((x, k) => { x.style.fontSize = `${(base[k] * r).toFixed(2)}px`; });
    }
  });
}

export function LiveEffects() {
  const path = usePathname();
  // Per page: count-ups and the tab highlight.
  useEffect(() => {
    // On laptops the page scrolls inside the rounded app window: start each new page at its top.
    const sh = document.querySelector<HTMLElement>('.shell');
    if (sh && sh.scrollHeight > sh.clientHeight && getComputedStyle(sh).overflowY !== 'visible') sh.scrollTop = 0;
    const main = document.getElementById('main') || document.body;
    tagFigures(main); tagCards(main); sizeBars(main);
    let stopCount = countUp(main); tagHeads(main);
    const stopReveal = reveal(main);
    const mo = new MutationObserver(() => { tagFigures(main); tagCards(main); sizeBars(main); stopCount(); stopCount = countUp(main); tagHeads(main); });
    mo.observe(main, { childList: true, subtree: true });
    const stopInk = reduced() ? () => {} : tabInk();
    try { if (!document.querySelector('.proj-tabs')) sessionStorage.removeItem('minawa.tabInk'); } catch { /* ignore */ }
    // Figures that would leave their boxes are scaled to fit: now, once the count-ups have finished, and whenever the
    // page is resized or zoomed.
    let ft: ReturnType<typeof setTimeout> | undefined;
    const fit = () => { clearTimeout(ft); ft = setTimeout(() => requestAnimationFrame(() => { fitText(main); sizeBars(main); }), 80); };
    fit(); const late = setTimeout(fit, 1700);
    const ro = new ResizeObserver(fit); ro.observe(main);
    const mo2 = new MutationObserver(fit); mo2.observe(main, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', fit);
    return () => { mo.disconnect(); stopCount(); stopInk(); stopReveal(); ro.disconnect(); mo2.disconnect(); clearTimeout(late); clearTimeout(ft); window.removeEventListener('resize', fit); };
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
/** Tabs with counters. A tab with `seen` clears its counter once it is opened, and remembers that in a cookie
 *  (name=value), so the counter only comes back for new items. */
export function LiveTabs({ tabs }: { tabs: { key: string; label: string; badge?: number; seen?: { name: string; value: string }; body: React.ReactNode }[] }) {
  const [on, setOn] = useState(tabs[0]?.key), [cleared, setCleared] = useState<Record<string, string>>({});
  const open = (t: typeof tabs[number]) => {
    setOn(t.key);
    if (t.seen && t.badge) {
      setCleared(c => ({ ...c, [t.key]: t.seen!.value }));   // until something newer arrives
      document.cookie = `${t.seen.name}=${encodeURIComponent(t.seen.value)}; path=/; max-age=31536000; samesite=lax`;
    }
  };
  return <>
    <div className="lv-tabs" role="tablist">{tabs.map(t => <button key={t.key} type="button" role="tab" aria-selected={on === t.key} className={on === t.key ? 'on' : ''} onClick={() => open(t)}>{t.label}{t.badge && !(t.seen && cleared[t.key] === t.seen.value) ? <i>{t.badge}</i> : null}</button>)}</div>
    {tabs.map(t => <div key={t.key} role="tabpanel" hidden={on !== t.key} className="lv-tabpanel">{t.body}</div>)}
  </>;
}
