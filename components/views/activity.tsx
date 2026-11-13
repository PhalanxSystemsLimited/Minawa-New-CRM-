// What staff did, from the activity log: the admin's view of each accountant's (and admin's) actions.
import type { LogEntry, Project, Staff } from '@/lib/types';
import { dow, fd, fds, addDays, todayPKT, t12 } from '@/lib/fmt';

export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
export const roleTag = (r: string) => r === 'admin' ? <span className="tag info">Admin</span> : <span className="tag">Accountant</span>;
/* Colour-coded activity badges: one for what kind of action it was (with an icon), and, where the entry says so,
 * one for how it ended (sent / not sent, prepared, created…). Colours come from the theme. */
type Tone = 'good' | 'bad' | 'warn' | 'info' | 'accent' | 'muted' | 'wa' | 'in';
const P = (d: string) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;
export const IC: Record<string, React.ReactNode> = {
  wa: P('<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/>'),
  card: P('<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19"/>'),
  link: P('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
  msg: P('<path d="M4 5h16v11H8l-4 4z"/>'),
  doc: P('<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  pct: P('<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>'),
  flag: P('<path d="M5 21V4h11l-2 4 2 4H5"/>'),
  alert: P('<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.1"/>'),
  gear: P('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>'),
  edit: P('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  in: P('<path d="M10 17l5-5-5-5M15 12H3M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>'),
  out: P('<path d="M14 17l5-5-5-5M19 12H8M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/>'),
  check: P('<path d="m5 12 5 5 9-10"/>'),
  clock: P('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  x: P('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  shield: P('<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/>'),
  bang: P('<path d="M12 5v9M12 18.5v.5"/>')
};
const KINDS: Record<string, [string, Tone, string]> = {
  payment: ['Payment', 'good', 'card'], webhook: ['Online payment', 'good', 'card'], link: ['Payment link', 'info', 'link'], message: ['Message', 'info', 'msg'],
  whatsapp: ['WhatsApp', 'wa', 'wa'], bill: ['Bill', 'accent', 'doc'], fine: ['Fine', 'bad', 'pct'], flag: ['Flag', 'bad', 'flag'], alert: ['Alert', 'warn', 'alert'],
  job: ['Setup', 'accent', 'gear'], admin: ['Change', 'warn', 'edit'], signin: ['Sign in', 'in', 'in'], signout: ['Sign out', 'muted', 'out'],
  approval: ['Approval', 'accent', 'shield']
};
const KIND: Record<string, string> = Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v[0]]));
/** Sign-outs logged before they had their own kind say so in the text. */
export const kindOf = (e: Pick<LogEntry, 'kind' | 'text'>) => e.kind === 'signin' && / signed out$/.test(e.text) ? 'signout' : e.kind;
export const kindLabel = (k: string) => KIND[k] || k;
/** How the action ended, from what the entry says. */
function outcome(e: Pick<LogEntry, 'kind' | 'text'>): [string, Tone, string] | null {
  const t = e.text;
  if (e.kind === 'whatsapp') return / but did not send /.test(t) ? ['Not sent', 'bad', 'bang'] : / sent (".*"|the .*) on WhatsApp /.test(t) ? ['Sent', 'good', 'check'] : null;
  if (e.kind === 'message') return /set aside/.test(t) ? ['Set aside', 'muted', 'bang'] : /prepared|ready to send|put back/.test(t) ? ['Prepared', 'info', 'doc'] : /failed/.test(t) ? ['Failed', 'bad', 'bang'] : / sent /.test(t) ? ['Sent', 'good', 'check'] : null;
  if (e.kind === 'link') return /cancel/i.test(t) ? ['Cancelled', 'muted', 'bang'] : /created/.test(t) ? ['Created', 'info', 'check'] : null;
  if (e.kind === 'payment' || e.kind === 'webhook') return /recorded|received|paid/i.test(t) ? ['Received', 'good', 'check'] : null;
  if (e.kind === 'approval') return / approved /.test(t) ? ['Approved', 'good', 'check'] : / rejected /.test(t) ? ['Rejected', 'bad', 'x'] : / withdrew /.test(t) ? ['Withdrawn', 'muted', 'x'] : / asked for /.test(t) ? ['Waiting', 'warn', 'clock'] : null;
  if (e.kind === 'flag') return /cleared/.test(t) ? ['Cleared', 'good', 'check'] : null;
  return null;
}
/** WhatsApp log answer: ✓ Sent / ! Not sent, and a Test badge for messages that went to the test number. */
export function WaAnswerBadges({ sent, test }: { sent: boolean; test?: boolean }) {
  return <span className="abadges">{sent ? <span className="k abadge solid t-good">{IC.check}Sent</span> : <span className="k abadge solid t-bad">{IC.bang}Not sent</span>}{test ? <span className="k abadge t-muted">Test</span> : null}</span>;
}
/** The kind badge and, when known, the outcome badge. */
export function KindBadges({ e }: { e: Pick<LogEntry, 'kind' | 'text'> }) {
  const k = kindOf(e), [label, tone, ic] = KINDS[k] || [k, 'muted' as Tone, 'gear'], o = outcome(e);
  return <><span className={`k ${k} abadge t-${tone}`}>{IC[ic]}{label}</span>{o ? <span className={`k abadge solid t-${o[1]}`}>{IC[o[2]]}{o[0]}</span> : null}</>;
}

export function lastSeen(d: string, t: string) {
  const today = todayPKT();
  return `${d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : fds(d)}, ${t12(t)}`;
}

/** Day-grouped list: time, who (initials chip and name), what kind, the project, and what they did. */
export function ActivityList({ list, staff, projects, showProject = true, empty = 'Nothing yet.' }: { list: LogEntry[]; staff: Staff[]; projects: Project[]; showProject?: boolean; empty?: string }) {
  if (!list.length) return <p className="empty">{empty}</p>;
  let day = '';
  return <div className="d-body log-page">{list.map(e => {
    const h = e.d !== day ? (day = e.d, <div className="ev-day">{dow(e.d)} {fd(e.d)}</div>) : null;
    const who = staff.find(s => s.id === e.staffId), name = who?.name || e.by || 'Staff';
    const proj = e.project && showProject ? projects.find(p => p.id === e.project)?.name : null;
    return <div key={e.id}>{h}<div className="ev act-ev"><span className="tm">{t12(e.t)}</span><div>
      <div className="act-who"><span className={`act-av${who?.role === 'admin' ? ' admin' : ''}`} aria-hidden="true">{initialsOf(name)}</span><b>{name}</b>{who ? <span className="cell-sub">{who.role === 'admin' ? 'Admin' : 'Accountant'}</span> : null}<KindBadges e={e} />{proj ? <span className="cell-sub">{proj}</span> : null}</div>
      <div className="act-text">{e.text}{e.ownerId && e.project ? <> <a className="act-open" href={`/p/${e.project}/apartments/${e.ownerId}`}>Open apartment</a></> : null}</div></div></div></div>;
  })}</div>;
}
