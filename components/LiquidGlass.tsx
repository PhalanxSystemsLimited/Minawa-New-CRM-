'use client';
// Liquid glass for the Frost theme (26 Nov 2026), after Apple's Liquid Glass. The containers themselves are the glass:
// what is behind them shows through, bent by a slow liquid ripple instead of a flat grey blur, with bright rims like
// thick glass (styles/minawa-themes.css, "Frost: liquid glass"). Nothing follows the pointer.
// This only supplies the SVG filter the containers' backdrop uses (in Chrome and Edge, which can bend a
// backdrop; other browsers get clear glass without the bending):
//  · #lg-liquid: a still liquid ripple (a smooth, seamless ripple picture, tiled). (A flowing version used on hover was
//    taken out on 26 Nov 2026: redrawing the backdrop made the background stutter.)
import { useEffect, useRef } from 'react';

const N = 256;
/** A smooth ripple that tiles seamlessly: red = sideways, green = up/down, 128 = still. */
function ripple() {
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'); if (!g) return '';
  const img = g.createImageData(N, N), T = 2 * Math.PI / N;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = 4 * (y * N + x);
    const r = .55 * Math.sin(T * (2 * x + y) + .7) + .3 * Math.sin(T * (x - 3 * y) + 2.1) + .15 * Math.sin(T * (5 * x + 2 * y) + 4.2);
    const gg = .55 * Math.sin(T * (x + 2 * y) + 1.9) + .3 * Math.sin(T * (3 * x - y) + .4) + .15 * Math.sin(T * (2 * x + 5 * y) + 3.3);
    img.data[i] = 128 + 127 * r; img.data[i + 1] = 128 + 127 * gg; img.data[i + 2] = 128; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export function LiquidGlass() {
  const a = useRef<SVGFEImageElement>(null);
  useEffect(() => {
    const ua = navigator.userAgent, bends = /Chrome\/\d+/.test(ua) && !/Firefox|FxiOS|CriOS/.test(ua);
    const map = bends ? ripple() : '';
    if (map) a.current?.setAttribute('href', map);
    document.documentElement.classList.toggle('lg-bend', !!map);
  }, []);
  return <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
    <filter id="lg-liquid" colorInterpolationFilters="sRGB">
      <feImage ref={a} x="0" y="0" width={N} height={N} preserveAspectRatio="none" result="cell" />
      <feTile in="cell" result="map" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale="26" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>;
}
