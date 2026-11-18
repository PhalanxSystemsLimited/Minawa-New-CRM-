// Artwork made for this CRM (update 101, Nov 2026): page icons, pictures for empty and all-clear states, a small
// apartment-block drawing for building cards, and simple charts. Everything is inline SVG or plain HTML and takes its
// colours from the theme (styles/minawa-polish.css), so it works in Light, Dark and Frost. No hooks: usable anywhere.
import { Ic } from '@/components/icons';

export type ArtTone = 'rust' | 'green' | 'amber' | 'blue' | 'violet' | 'red' | 'teal' | 'slate';

/** The icon tile beside a page title. */
export function PageIc({ n, tone = 'rust' }: { n: string; tone?: ArtTone }) {
  return <span className={`ph-ic t-${tone}`} aria-hidden="true"><Ic n={n} s={24} /></span>;
}

/** The icon in the corner of a figure box (.kpi). */
export function KIc({ n, tone = 'rust' }: { n: string; tone?: ArtTone }) {
  return <span className={`kpi-ic t-${tone}`} aria-hidden="true"><Ic n={n} s={18} /></span>;
}

type EmptyKind = 'done' | 'inbox' | 'pay' | 'send' | 'search' | 'cal' | 'cash';
const PICS: Record<EmptyKind, React.ReactNode> = {
  // an apartment block with a tick: everything is in order
  done: <>
    <ellipse cx="60" cy="86" rx="40" ry="5" className="il-sh" />
    <rect x="34" y="26" width="38" height="58" rx="4" className="il-s" />
    <rect x="72" y="46" width="20" height="38" rx="3" className="il-s2" />
    <path d="M42 36h8M56 36h8M42 46h8M56 46h8M42 56h8M56 56h8M42 66h8M56 66h8M78 56h8M78 66h8" className="il-w" />
    <rect x="48" y="72" width="10" height="12" rx="1.5" className="il-d" />
    <circle cx="82" cy="30" r="14" className="il-a" /><path d="m75.5 30 4.5 4.5 8-9" className="il-t" />
    <path d="M22 30v6M19 33h6M100 62v5M97.5 64.5h5" className="il-sp" />
  </>,
  // an empty tray: nothing is waiting
  inbox: <>
    <ellipse cx="60" cy="86" rx="40" ry="5" className="il-sh" />
    <path d="M30 52 40 30h40l10 22v22a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6z" className="il-s" />
    <path d="M30 52h18l4 8h16l4-8h18" className="il-l" />
    <path d="M46 40h28M43 46h34" className="il-w" />
    <circle cx="88" cy="26" r="10" className="il-a" /><path d="m83.5 26 3.2 3.2 5.8-6.4" className="il-t" />
    <path d="M24 28v6M21 31h6" className="il-sp" />
  </>,
  // a receipt and a note: no payments yet
  pay: <>
    <ellipse cx="60" cy="86" rx="40" ry="5" className="il-sh" />
    <path d="M38 20h34v60l-5.6-3.4L60.7 80l-5.7-3.4-5.7 3.4-5.6-3.4L38 80z" className="il-s" />
    <path d="M46 32h18M46 40h18M46 48h12" className="il-w" />
    <rect x="58" y="52" width="38" height="24" rx="4" className="il-s2" /><circle cx="77" cy="64" r="6" className="il-a" />
    <path d="M64 64h.01M90 64h.01" className="il-l" /><path d="M77 61v6M75 62.5h3a1.5 1.5 0 0 1 0 3h-2" className="il-t2" />
    <path d="M26 44v6M23 47h6" className="il-sp" />
  </>,
  // a paper plane: nothing to send
  send: <>
    <ellipse cx="60" cy="88" rx="36" ry="4.5" className="il-sh" />
    <path d="M22 70c14 6 26 2 34-8" className="il-dash" />
    <path d="M98 22 48 44l18 8 8 18z" className="il-s" /><path d="M98 22 66 52l8 18z" className="il-s2" /><path d="M98 22 66 52" className="il-l" />
    <circle cx="34" cy="34" r="11" className="il-a" /><path d="m29 34 3.6 3.6L39 30.6" className="il-t" />
    <path d="M90 66v6M87 69h6" className="il-sp" />
  </>,
  // a magnifier over a list: nothing matches
  search: <>
    <ellipse cx="60" cy="86" rx="40" ry="5" className="il-sh" />
    <rect x="28" y="22" width="52" height="58" rx="6" className="il-s" />
    <path d="M38 34h32M38 44h32M38 54h20M38 64h26" className="il-w" />
    <circle cx="78" cy="58" r="15" className="il-s2" /><circle cx="78" cy="58" r="15" className="il-l" /><path d="m89 69 9 9" className="il-acc-l" />
    <path d="M73 58h10" className="il-l" />
  </>,
  // a calendar: nothing scheduled
  cal: <>
    <ellipse cx="60" cy="86" rx="40" ry="5" className="il-sh" />
    <rect x="30" y="26" width="60" height="54" rx="7" className="il-s" /><path d="M30 40a7 7 0 0 1 7-7h46a7 7 0 0 1 7 7v2H30z" className="il-a" />
    <path d="M44 22v10M76 22v10" className="il-l" />
    <path d="M40 52h8M56 52h8M72 52h8M40 62h8M56 62h8M72 62h8M40 72h8" className="il-w" />
    <path d="M100 50v6M97 53h6" className="il-sp" />
  </>,
  // a cash box: no cash waiting
  cash: <>
    <ellipse cx="60" cy="86" rx="40" ry="5" className="il-sh" />
    <rect x="28" y="40" width="64" height="40" rx="6" className="il-s" /><path d="M36 40V32a6 6 0 0 1 6-6h36a6 6 0 0 1 6 6v8" className="il-l" />
    <rect x="52" y="54" width="16" height="12" rx="3" className="il-a" /><path d="M60 58v4" className="il-t2" />
    <path d="M28 52h64" className="il-l" />
    <path d="M100 30v6M97 33h6M20 60v5M17.500 62.5h5" className="il-sp" />
  </>,
};

/** A picture with a line of text for "nothing here" and "all clear" states. `card` wraps it in a dashed card. */
export function Empty({ kind = 'inbox', title, children, card, small }: { kind?: EmptyKind; title?: React.ReactNode; children?: React.ReactNode; card?: boolean; small?: boolean }) {
  const body = <div className={`il-empty${small ? ' sm' : ''}`}>
    <svg className="il" viewBox="0 0 120 96" aria-hidden="true">{PICS[kind]}</svg>
    {title ? <div className="il-t1">{title}</div> : null}
    {children ? <p className="il-p">{children}</p> : null}
  </div>;
  return card ? <div className="card allclear il-card">{body}</div> : body;
}

/** A small drawing of an apartment block, different for each building (picked by its id). Purely decorative. */
export function BuildingArt({ seed, className = '' }: { seed: string; className?: string }) {
  const h = [...seed].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7), v = h % 3;
  const win = (x: number, y: number, cols: number, rows: number, lit: number) => Array.from({ length: cols * rows }, (_, i) => {
    const on = ((h >> (i % 24)) + i * lit) % 3 === 0;
    return <rect key={`${x}-${y}-${i}`} x={x + (i % cols) * 7} y={y + Math.floor(i / cols) * 8} width="4" height="5" rx="1" className={on ? 'ba-on' : 'ba-off'} />;
  });
  return <svg className={`ba v${v}${className ? ' ' + className : ''}`} viewBox="0 0 132 72" aria-hidden="true" preserveAspectRatio="xMaxYMax meet">
    <path d="M0 71.500h132" className="ba-g" />
    {v === 0 ? <>
      <rect x="18" y="34" width="26" height="38" rx="2.500" className="ba-b2" />{win(23, 40, 3, 3, 5)}
      <rect x="48" y="10" width="36" height="62" rx="3" className="ba-b1" />{win(54, 17, 4, 6, 7)}
      <rect x="88" y="26" width="28" height="46" rx="2.500" className="ba-b2" />{win(93, 32, 3, 4, 3)}
      <path d="M66 10V3" className="ba-l" /><circle cx="66" cy="3" r="1.500" className="ba-dot" />
    </> : v === 1 ? <>
      <rect x="14" y="22" width="34" height="50" rx="3" className="ba-b1" />{win(20, 29, 4, 5, 3)}
      <rect x="52" y="38" width="24" height="34" rx="2.500" className="ba-b2" />{win(57, 44, 2, 3, 5)}
      <rect x="80" y="14" width="38" height="58" rx="3" className="ba-b1" />{win(86, 21, 4, 6, 7)}
      <path d="M80 14l19-9 19 9" className="ba-l" />
    </> : <>
      <rect x="10" y="40" width="30" height="32" rx="2.500" className="ba-b2" />{win(15, 46, 3, 3, 7)}
      <path d="M44 72V20a3 3 0 0 1 3-3h30a3 3 0 0 1 3 3v52z" className="ba-b1" />{win(50, 24, 4, 6, 3)}
      <rect x="84" y="30" width="34" height="42" rx="2.500" className="ba-b2" />{win(90, 36, 4, 4, 5)}
      <path d="M44 17h36" className="ba-l" /><path d="M56 17V9h12v8" className="ba-l" />
    </>}
  </svg>;
}

/** Bars for a series of amounts (a month by day, months of a year). The tallest bar is the full height; each bar
 *  shows its amount on hover and to screen readers. */
export function BarChart({ items, fmt, tone = 'rust', height = 150 }: { items: { label: string; value: number; sub?: string; name?: string }[]; fmt: (n: number) => string; tone?: ArtTone; height?: number }) {
  const max = Math.max(1, ...items.map(x => x.value));
  return <div className={`bc t-${tone}`} style={{ ['--bc-h' as string]: `${height}px` }} role="img" aria-label={items.filter(x => x.value).map(x => `${x.name || x.label}: ${fmt(x.value)}`).join(', ') || 'No amounts'}>
    <div className="bc-grid" aria-hidden="true"><span><i>{fmt(max)}</i></span><span><i>{fmt(Math.round(max / 2))}</i></span><span></span></div>
    <div className="bc-bars">{items.map((x, i) => <div key={i} className={`bc-col${x.value === max ? ' bc-max' : ''}${x.value ? '' : ' bc-zero'}`} title={`${x.name || x.label}: ${fmt(x.value)}${x.sub ? ` · ${x.sub}` : ''}`}>
      <span className="bc-bar" style={{ height: `${x.value ? Math.max(4, Math.round(100 * x.value / max)) : 0}%`, animationDelay: `${Math.min(.6, .035 * i)}s` }}><b>{fmt(x.value)}</b></span>
      <i>{x.label}</i></div>)}</div>
  </div>;
}

/** One bar split into parts with a legend: what a total is made of. */
export function SplitBar({ parts, fmt }: { parts: { label: string; value: number; tone: ArtTone }[]; fmt: (n: number) => string }) {
  const all = parts.reduce((a, p) => a + Math.max(0, p.value), 0), shown = parts.filter(p => p.value > 0);
  return <div className="sb">
    <div className="sb-bar" role="img" aria-label={shown.map(p => `${p.label} ${fmt(p.value)}`).join(', ')}>
      {shown.length ? shown.map((p, i) => <span key={i} className={`t-${p.tone}`} style={{ width: `${Math.max(2, 100 * p.value / Math.max(1, all))}%`, animationDelay: `${.12 * i}s` }} title={`${p.label}: ${fmt(p.value)}`}></span>) : <span className="t-none" style={{ width: '100%' }}></span>}
    </div>
    <div className="sb-k">{parts.map((p, i) => <div key={i} className="sb-i"><i className={`t-${p.tone}`}></i><span>{p.label}</span><b className="num">{fmt(p.value)}</b><small>{all ? Math.round(100 * Math.max(0, p.value) / all) : 0}%</small></div>)}</div>
  </div>;
}

/** A ring with a percentage in the middle (collected of billed, and the like). */
export function Donut({ pct, label, tone = 'green', size = 92 }: { pct: number; label?: string; tone?: ArtTone; size?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct))), r = 40, c = 2 * Math.PI * r;
  return <div className={`dn t-${tone}`} style={{ width: size, height: size }} role="img" aria-label={`${p}%${label ? ' ' + label : ''}`}>
    <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r={r} className="dn-bg" /><circle cx="50" cy="50" r={r} className="dn-fg" style={{ strokeDasharray: `${(c * p / 100).toFixed(1)} ${c.toFixed(1)}` }} /></svg>
    <div className="dn-t"><b className="num">{p}%</b>{label ? <small>{label}</small> : null}</div>
  </div>;
}
