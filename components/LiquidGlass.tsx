'use client';
// Liquid glass for the Frost theme (26 Nov 2026), after Apple's Liquid Glass. Only while Frost is on.
// When the pointer is over a glass surface (a card, a tile, a button, a menu item…), a layer is laid exactly over it
// (same place and rounded corners, never catching clicks) with:
//  · a liquid lens: a drop of glass that follows the pointer with a little lag, stretching in the direction it moves
//    and settling back like a liquid. In Chrome and Edge it really bends what is under it (an SVG displacement
//    filter on its backdrop); in other browsers it brightens and sharpens it instead.
//  · a specular rim: the edge of the surface lights up nearest the pointer;
//  · a soft glow under the pointer.
// Nothing on the page itself is changed (no extra elements inside cards, no transforms), so layouts, menus and
// modals behave exactly as before. Off with "reduce motion" (then only the rim and glow show, without lag).
import { useEffect, useRef } from 'react';

const GLASS = [
  '.btn', '.icon-btn', '.chipbtn', '.cm-item', '.side-i', '.proj-tabs a', '.proj-tabs button', '.ptabs a', '.thm', '.gsearch', '.me', '.bell-btn',
  '.mgr-cu', '.mgr-pay', '.mgr-save', '.mgr-tabs a', '.mgr-out', '.mgr-back',
  '.lv-need', '.kpi', '.lv-kpi', '.stat', '.pcard', '.bs-card', '.mgr-card', '.mgr-money', '.lv-money', '.callout', '.li', '.card', '.m-card', '.menu', '.side', '.top', '.mgr-top',
].join(',');
const isFrost = () => document.documentElement.dataset.theme === 'frost';

/** The lens's displacement map: a drop of glass that is clear in the middle and bends most towards its edge, like
 *  Apple's Liquid Glass. Red = sideways, green = up/down, 128 = no shift. */
function lensMap(n = 256) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'); if (!g) return '';
  const img = g.createImageData(n, n), h = n / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const nx = (x + .5 - h) / h, ny = (y + .5 - h) / h, d = Math.hypot(nx, ny), i = 4 * (y * n + x);
    let r = 128, gg = 128;
    if (d < 1) {
      // Clear in the middle; from about half way out the glass bends more and more towards its edge, then eases off
      // in the last few pixels so the rim has no hard seam.
      const t = Math.max(0, (d - .45) / .55), m = t * t * (3 - 2 * t), fade = d > .95 ? (1 - d) / .05 : 1, k = d ? (m / d) * fade : 0;
      r = 128 + 127 * nx * k; gg = 128 + 127 * ny * k;
    }
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = 128; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export function LiquidGlass() {
  const layer = useRef<HTMLDivElement>(null), lens = useRef<HTMLDivElement>(null), img = useRef<SVGFEImageElement>(null), disp = useRef<SVGFEDisplacementMapElement>(null);

  useEffect(() => {
    const L = layer.current!, D = lens.current!;
    const ua = navigator.userAgent, bends = /Chrome\/\d+/.test(ua) && !/Firefox|FxiOS|CriOS/.test(ua);
    const map = lensMap();
    if (map && img.current) img.current.setAttribute('href', map);
    document.documentElement.classList.toggle('lg-bend', bends && !!map);
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

    let hot: HTMLElement | null = null, raf = 0, size = 0, seen = false;
    const tgt = { x: 0, y: 0 }, cur = { x: 0, y: 0 }, vel = { x: 0, y: 0 };

    const place = () => {
      if (!hot) return;
      if (!hot.isConnected || !isFrost()) { off(); return; }   // the page changed under the pointer, or the theme
      const r = hot.getBoundingClientRect(), cs = getComputedStyle(hot);
      Object.assign(L.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: cs.borderRadius });
      // The drop: bigger on big surfaces, never much bigger than a button.
      const big = r.width * r.height > 120000, s = Math.round(r.height < 72 ? Math.max(52, r.height * 1.35) : big ? 132 : Math.min(118, Math.max(84, r.height * .8)));
      if (s !== size) {
        size = s; D.style.width = D.style.height = `${s}px`;
        img.current?.setAttribute('width', String(s)); img.current?.setAttribute('height', String(s));
        disp.current?.setAttribute('scale', String(Math.round(s * (big ? .42 : .5))));
      }
      return r;
    };
    const tick = () => {
      raf = 0; if (!hot) return;
      const r = place(); if (!r) return;
      const k = calm.matches ? 1 : .2;
      const nx = cur.x + (tgt.x - cur.x) * k, ny = cur.y + (tgt.y - cur.y) * k;
      vel.x = vel.x * .6 + (nx - cur.x) * .4; vel.y = vel.y * .6 + (ny - cur.y) * .4; cur.x = nx; cur.y = ny;
      const lx = cur.x - r.left, ly = cur.y - r.top, sp = Math.min(1, Math.hypot(vel.x, vel.y) / 22), ang = Math.atan2(vel.y, vel.x) * 180 / Math.PI;
      L.style.setProperty('--lx', `${lx}px`); L.style.setProperty('--ly', `${ly}px`);
      D.style.transform = `translate(${lx - size / 2}px,${ly - size / 2}px) rotate(${ang}deg) scale(${1 + sp * .28},${1 - sp * .18})`;
      if (Math.abs(tgt.x - cur.x) > .3 || Math.abs(tgt.y - cur.y) > .3 || sp > .01) raf = requestAnimationFrame(tick);
    };
    const go = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const off = () => { if (!hot) return; hot = null; L.classList.remove('on'); };
    const move = (e: PointerEvent) => {
      if (!isFrost()) { off(); return; }
      const t = (e.target instanceof Element ? e.target.closest<HTMLElement>(GLASS) : null);
      // Not over the layer's own parts, nor inside an open modal's backdrop, nor on disabled things.
      if (!t || t.closest('.lg-layer') || t.matches('[disabled],[aria-disabled=true]')) { off(); return; }
      tgt.x = e.clientX; tgt.y = e.clientY;
      if (t !== hot) {
        const fresh = !hot; hot = t; size = 0; place();
        if (fresh || !seen) { cur.x = tgt.x; cur.y = tgt.y; vel.x = vel.y = 0; }
        seen = true; L.classList.add('on');
      }
      go();
    };
    const leave = (e: PointerEvent) => { if (!e.relatedTarget) off(); };
    const scroll = () => { if (hot) go(); };
    const click = () => { setTimeout(() => { if (hot) go(); }, 350); };   // a click that opens or changes something
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerdown', move, { passive: true });
    document.addEventListener('pointerout', leave, { passive: true });
    window.addEventListener('scroll', scroll, { passive: true, capture: true });
    window.addEventListener('blur', off);
    document.addEventListener('click', click, { passive: true });
    return () => {
      document.removeEventListener('click', click);
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerdown', move); document.removeEventListener('pointerout', leave);
      window.removeEventListener('scroll', scroll, { capture: true }); window.removeEventListener('blur', off); cancelAnimationFrame(raf);
    };
  }, []);

  return <>
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <filter id="lg-lens" colorInterpolationFilters="sRGB">
        <feFlood floodColor="rgb(128,128,128)" result="flat" />
        <feImage ref={img} x="0" y="0" width="140" height="140" preserveAspectRatio="none" result="dome" />
        <feComposite in="dome" in2="flat" operator="over" result="map" />
        <feDisplacementMap ref={disp} in="SourceGraphic" in2="map" scale="44" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
    <div ref={layer} className="lg-layer" aria-hidden="true">
      <div className="lg-glow"></div>
      <div ref={lens} className="lg-lens"></div>
      <div className="lg-rim"></div>
    </div>
  </>;
}
