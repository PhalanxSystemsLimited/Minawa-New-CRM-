// Pieces of the dark summary panel (Dashboard and a project's Overview): short labels and numbers instead of sentences.
import { Go } from '@/components/client';
import { Ic } from '@/components/icons';
import { diff, fd, fm, rs } from '@/lib/fmt';

/** "2 things need you" (a button to To do) or "Nothing needs you today". */
export function HeroStatus({ todo, href }: { todo: number; href: string }) {
  return todo
    ? <Go href={href} className="hstatus warn"><Ic n="alert" s={15} /><span><b>{todo}</b> thing{todo === 1 ? '' : 's'} need{todo === 1 ? 's' : ''} you today</span><Ic n="chev" s={14} /></Go>
    : <span className="hstatus ok"><Ic n="check" s={15} /><span>Nothing needs you today</span></span>;
}

/** Before the first bill: the date, a countdown and what it is for. */
export function HeroStart({ date, month, today, extra }: { date: string; month: string; today: string; extra?: React.ReactNode }) {
  const days = Math.max(0, diff(date, today));
  return <div className="hstart">
    <span className="hstart-ic" aria-hidden="true"><Ic n="bolt" s={18} /></span>
    <div className="hstart-t"><div className="l">Billing starts</div><div className="v num">{fd(date)}</div></div>
    <div className="hstart-tag">{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : <><b className="num">{days}</b> days to go</>}</div>
    <div className="hstart-s">First bill: {fm(month)}{extra ? <> · {extra}</> : null}</div>
  </div>;
}

/** One number in the panel, with an optional short note under it. Clickable when `href` is given. */
export function HeroStat({ label, value, sub, href, neon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; href?: string; neon?: boolean }) {
  const body = <><div className="l">{label}</div><div className={`v num${neon ? ' neon' : ''}`}>{value}</div>{sub ? <div className="s">{sub}</div> : null}</>;
  return href ? <Go href={href} className="hs hs-btn">{body}</Go> : <div className="hs">{body}</div>;
}

/** The office's 2026 sheet: how much of the year (with arrears) is paid, as a bar. */
export function HeroYear({ paid, due, asOf }: { paid: number; due: number; asOf: string | null }) {
  const pct = due ? Math.round(100 * paid / due) : 0;
  return <div className="hyear">
    <div className="hyear-top"><span className="l">2026 paid{asOf ? <small> · office sheet {fd(asOf)}</small> : null}</span><b className="num">{pct}%</b></div>
    <div className="hyear-bar" role="img" aria-label={`${pct}% of 2026 paid`}><span style={{ width: `${Math.min(100, pct)}%` }}></span></div>
    <div className="hyear-s"><span><b className="num">{rs(paid)}</b> paid</span><span>of <b className="num">{rs(due)}</b> owed with arrears</span></div>
  </div>;
}
