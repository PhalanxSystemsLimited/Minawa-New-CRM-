// Small pieces of markup shared by the views. Plain functions, called inside use(state, …) so they can read the engine.
import type { Payment, Owner } from '@/lib/types';
import { cur, type OwnerStatus } from '@/lib/engine';
import { spInfo } from '@/lib/docdata';
import { addDays, fd, fds, t12 } from '@/lib/fmt';
import { Ic, Wa } from '../icons';
import { Go, A } from '../client';

export const STATUS_LABEL: Record<string, string> = { paid: 'Paid', due: 'Due', overdue: 'Overdue', flagged: 'Flagged', exempt: 'Exempt', transferred: 'Transferred' };
export const pill = (s: OwnerStatus) => <span className={`pill ${s}`}>{STATUS_LABEL[s]}</span>;
export const when = (d: string, t: string) => { const S = cur(); return `${d === S.today ? 'Today' : d === addDays(S.today, -1) ? 'Yesterday' : fds(d)}, ${t12(t)}`; };
export const P = (pid: string, sub = '') => `/p/${pid}${sub}`;
export const ownerHref = (o: Owner, extra = '') => `/p/${o.project}/apartments/${o.id}${extra}`;
export function viaHtml(p: Payment) {
  const sp = spInfo(p);
  if (sp) return <><span className="sp-ok"><Ic n="check" s={13} /> Safepay received</span><div className="cell-sub">Card · {sp.mode === 'sandbox' ? 'Safepay sandbox' : sp.mode === 'simulated' ? 'simulated' : 'Safepay'}{sp.tracker ? <> · <span className="num" title="Safepay tracker">{sp.tracker.slice(0, 14)}…</span></> : null}</div></>;
  return <><span className="recv-by"><Ic n="bank" s={13} /> {p.method.replace(' (screenshot checked)', '')}</span><div className="cell-sub">{p.source === 'proof' ? `Screenshot checked by ${p.by}` : `Recorded by ${p.by}`}</div></>;
}
export const rcpt = (p: Payment, path: string) => <A href={`${path}${path.includes('?') ? '&' : '?'}doc=receipt:${p.id}`} className="rcpt">{p.receipt}</A>;
export const waMini = (o: Owner) => <Go href={ownerHref(o, '?m=send')} className="wa-mini" title="Send a payment link on WhatsApp" ariaLabel={`Send ${o.name} a payment link on WhatsApp`}><Wa /></Go>;
export const waBtn = (o: Owner) => <Go href={ownerHref(o, '?m=send')} className="btn wa"><Wa /> Send on WhatsApp</Go>;
export const ownerSince = (o: Owner) => o.possessionKnown === false ? 'owner since: not on file' : `owner since ${fd(o.possession)}`;
export const pluralS = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
