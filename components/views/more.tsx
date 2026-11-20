// Long lists, a page at a time (21 Nov 2026): 30 rows to start with, then "Show 50 more" or "Show all", so big
// buildings don't slow the screen down. The number shown is in the address (?n=80 or ?n=all), so Back keeps it.
import { Go } from '@/components/client';

export const FIRST = 30, MORE = 50;
/** How many rows to show: 30 by default, more or all when asked. */
export function shownOf(n: string | undefined, total: number) {
  if (n === 'all') return total;
  const k = Math.round(+(n || 0));
  return Math.min(total, Number.isFinite(k) && k > FIRST ? k : FIRST);
}
/** The bar under the list. `href(n)` is the same screen showing n rows ('' = the first 30). */
export function MoreBar({ shown, total, noun, href }: { shown: number; total: number; noun: string; href: (n: string) => string }) {
  if (total <= FIRST) return null;
  const left = total - shown;
  return <div className="more-bar no-print" role="navigation" aria-label={`More ${noun}s`}>
    <span className="cell-sub">Showing <b>{shown}</b> of {total} {noun}{total === 1 ? '' : 's'}</span>
    {left > 0 ? <>
      {left > MORE ? <Go href={href(String(shown + MORE))} className="btn sm" replace>Show {MORE} more</Go> : null}
      <Go href={href('all')} className="btn sm" replace>{left > MORE ? `Show all ${total}` : `Show the other ${left}`}</Go>
    </> : <Go href={href('')} className="btn sm ghost" replace>Show fewer</Go>}
  </div>;
}
