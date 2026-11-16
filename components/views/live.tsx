// Building blocks of the "live" design (Nov 2026): action tiles, progress rings, trend lines, the billing cycle and
// a money panel. Server components; the motion (count-up, floating, hover light, tilt) is added by components/Live.tsx.
import { Go } from '@/components/client';
import { Ic } from '@/components/icons';

export type Tone = 'red' | 'amber' | 'green' | 'blue' | 'grey';

/** A number that counts up when it first comes into view. The text shown is always the real, formatted value. */
export function Num({ v, children, className }: { v: number; children: React.ReactNode; className?: string }) {
  return <span className={`num${className ? ' ' + className : ''}`} data-count={Math.round(v)}>{children}</span>;
}

/** "Needs you" tile: a big count, what it is, a short note, and where it goes. */
export function NeedTile({ icon, tone, n, label, sub, href, pulse }: { icon: string; tone: Tone; n: number; label: string; sub?: React.ReactNode; href: string; pulse?: boolean }) {
  return <Go href={href} className={`lv-need lv-float t-${tone}${n ? '' : ' zero'}`} ariaLabel={`${n} ${label}`}>
    <span className="lv-need-ic" aria-hidden="true"><Ic n={icon} s={20} /></span>
    <span className="lv-need-t"><b className="H"><Num v={n}>{n}</Num></b><span>{label}</span></span>
    {pulse && n ? <span className="lv-pulse" aria-hidden="true"></span> : null}
    <span className="lv-need-go" aria-hidden="true">→</span>
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

/** A figure in the dark money panel. */
export function Kpi({ label, value, sub, hl, children, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; hl?: boolean; children?: React.ReactNode; href?: string }) {
  const body = <><div className="l">{label}</div><div className="v H">{value}</div>{sub ? <div className="s">{sub}</div> : null}{children}</>;
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
