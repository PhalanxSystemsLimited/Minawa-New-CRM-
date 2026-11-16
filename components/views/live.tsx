// Building blocks of the "live" design (Nov 2026): action tiles, progress rings, trend lines, the billing cycle and
// a money panel. Server components; the motion (count-up, floating, hover light, tilt) is added by components/Live.tsx.
import { Go } from '@/components/client';
import { Ic } from '@/components/icons';

export type Tone = 'red' | 'amber' | 'green' | 'blue' | 'grey';

/** A number that counts up when it first comes into view. The text shown is always the real, formatted value. */
export function Num({ v, children, className }: { v: number; children: React.ReactNode; className?: string }) {
  return <span className={`num${className ? ' ' + className : ''}`} data-count={Math.round(v)}>{children}</span>;
}

/** "Needs you" tile: what it is (title), a big count, a short note, and where it goes when clicked. */
export function NeedTile({ icon, tone, n, label, sub, href, pulse, title }: { icon: string; tone: Tone; n: number; label: string; sub?: React.ReactNode; href: string; pulse?: boolean; title?: string }) {
  return <Go href={href} className={`lv-need lv-float t-${tone}${n ? '' : ' zero'}`} ariaLabel={`${title ? title + ': ' : ''}${n} ${label}`}>
    <span className="lv-need-top">
      <span className={`lv-need-ic ic-${icon}`} aria-hidden="true"><Ic n={icon} s={20} /></span>
      {title ? <span className="lv-need-ttl">{title}</span> : null}
      {pulse && n ? <span className="lv-pulse" aria-hidden="true"></span> : null}
      <span className="lv-need-go" aria-hidden="true">→</span>
    </span>
    <span className="lv-need-t"><b className="H"><Num v={n}>{n}</Num></b><span>{label}</span></span>
    {sub ? <span className="lv-need-s">{sub}</span> : null}
  </Go>;
}

/** A ring showing a percentage. */
export function Ring({ pct, label, tone = 'green', size = 132 }: { pct: number; label: string; tone?: Tone; size?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return <div className={`lv-ring t-${tone}`} style={{ ['--p' as string]: p, width: size, height: size }} role="img" aria-label={`${p}% ${label}`}>
    <div><b className="H"><Num v={p}>{p}</Num>%</b><small>{label}</small></div>
  </div>;
}

/** A small trend line from a series of values (oldest first). */
export function Spark({ values, tone = 'rust' }: { values: number[]; tone?: 'rust' | 'grey' | 'green' }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values), w = 160, h = 30, step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, h - 3 - (v / max) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return <svg className={`lv-spark s-${tone}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
    <path d={`${d} L${w} ${h} L0 ${h} Z`} className="a" /><path d={d} className="l" />
    <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" className="c" />
  </svg>;
}

export type KTone = 'rust' | 'amber' | 'blue' | 'green' | 'violet' | 'red' | 'teal';

/** A small coloured icon button for a figure; it plays its own animation when the figure is hovered. */
export const KIcon = ({ icon, tone = 'rust' }: { icon: string; tone?: KTone }) =>
  <span className={`lv-kic k-${tone} ki-${icon}`} aria-hidden="true"><Ic n={icon} s={18} /></span>;

/** A figure in the dark money panel. */
export function Kpi({ label, value, sub, hl, children, href, icon, tone, chart }: { label: string; value: React.ReactNode; sub?: React.ReactNode; hl?: boolean; children?: React.ReactNode; href?: string; icon?: string; tone?: KTone; chart?: React.ReactNode }) {
  const head = icon ? <div className="lv-kh"><KIcon icon={icon} tone={tone} /><div className="l">{label}</div></div> : <div className="l">{label}</div>;
  const val = chart ? <div className="lv-kv"><div className="v H">{value}</div>{chart}</div> : <div className="v H">{value}</div>;
  const body = <>{head}{val}{sub ? <div className="s">{sub}</div> : null}{children}</>;
  return href ? <Go href={href} className={`lv-kpi${hl ? ' hl' : ''}`}>{body}</Go> : <div className={`lv-kpi${hl ? ' hl' : ''}`}>{body}</div>;
}

/** The billing cycle as steps along a line; `at` is how many steps are done. */
export function Cycle({ steps, at = 0 }: { steps: { k: string; title: string; sub: string; tag?: string; tone?: Tone }[]; at?: number }) {
  return <div className="lv-cycle" style={{ ['--done' as string]: `${Math.max(0, Math.min(1, at / Math.max(1, steps.length - 1))) * 100}%`, ['--n' as string]: steps.length }}>
    {steps.map((s, i) => <div key={i} className={`lv-step${i < at ? ' done' : i === at ? ' on' : ''}`}>
      <span className="dot H">{s.k}</span><b>{s.title}</b><small>{s.sub}</small>{s.tag ? <span className={`tag-s t-${s.tone || 'grey'}`}>{s.tag}</span> : null}
    </div>)}
  </div>;
}

/** A small calendar badge: month on top, day below. */
export function CalBadge({ date, tone = 'rust' }: { date: string; tone?: 'rust' | 'blue' | 'amber' | 'green' }) {
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return <span className={`lv-cal c-${tone}`} aria-hidden="true"><i>{MON[+date.slice(5, 7) - 1]}</i><b className="H">{+date.slice(8, 10)}</b></span>;
}

/** Section label with a fading rule. */
export const Lbl = ({ children }: { children: React.ReactNode }) => <div className="lv-lbl">{children}</div>;

/** Initials for an avatar. */
export const initials = (s: string) => s.split(/[\s·-]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

/** One bar split into parts (e.g. what is owed: old arrears, bills, fines), with a small key. */
export function Stack({ parts }: { parts: { v: number; label: string; tone: KTone }[] }) {
  const all = parts.reduce((a, p) => a + Math.max(0, p.v), 0), shown = parts.filter(p => p.v > 0);
  return <div className="lv-stack">
    <div className="lv-stack-bar" role="img" aria-label={shown.map(p => `${p.label} ${Math.round(100 * p.v / Math.max(1, all))}%`).join(', ')}>
      {shown.map((p, i) => <span key={i} className={`k-${p.tone}`} style={{ width: `${Math.max(3, 100 * p.v / Math.max(1, all))}%`, animationDelay: `${.15 * i}s` }}></span>)}
      {!shown.length ? <span className="k-none" style={{ width: '100%' }}></span> : null}
    </div>
    <div className="lv-stack-k">{parts.map((p, i) => <span key={i}><i className={`k-${p.tone}`}></i>{p.label} <b>{Math.round(100 * Math.max(0, p.v) / Math.max(1, all))}%</b></span>)}</div>
  </div>;
}

/** A small ring for a share (e.g. apartments owing out of all). */
export function MiniRing({ pct, tone = 'blue' }: { pct: number; tone?: KTone }) {
  const p = Math.max(0, Math.min(100, Math.round(pct))), r = 19, c = 2 * Math.PI * r;
  return <svg className={`lv-mring k-${tone}`} viewBox="0 0 48 48" role="img" aria-label={`${p}%`}>
    <circle cx="24" cy="24" r={r} className="bg" /><circle cx="24" cy="24" r={r} className="fg" style={{ strokeDasharray: `${(c * p / 100).toFixed(1)} ${c.toFixed(1)}` }} />
    <text x="24" y="27.5" textAnchor="middle">{p}%</text>
  </svg>;
}

/** Small columns for the last few months (oldest first); the latest is highlighted. */
export function Bars({ values, labels, tone = 'green' }: { values: number[]; labels: string[]; tone?: KTone }) {
  const max = Math.max(1, ...values);
  return <div className={`lv-bars k-${tone}`} role="img" aria-label={values.map((v, i) => `${labels[i]}: ${v}`).join(', ')}>
    {values.map((v, i) => <div key={i} className={i === values.length - 1 ? 'on' : ''}><span style={{ height: `${Math.max(v ? 8 : 3, Math.round(100 * v / max))}%`, animationDelay: `${.06 * i}s` }}></span><i>{labels[i]}</i></div>)}
  </div>;
}
