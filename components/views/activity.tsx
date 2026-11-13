// What staff did, from the activity log: the admin's view of each accountant's (and admin's) actions.
import type { LogEntry, Project, Staff } from '@/lib/types';
import { dow, fd, fds, addDays, todayPKT } from '@/lib/fmt';

export const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('') || '?';
export const roleTag = (r: string) => r === 'admin' ? <span className="tag info">Admin</span> : <span className="tag">Accountant</span>;
const KIND: Record<string, string> = { payment: 'Payment', webhook: 'Payment', link: 'Link', message: 'Message', whatsapp: 'WhatsApp', bill: 'Bill', fine: 'Fine', flag: 'Flag', alert: 'Alert', job: 'Setup', admin: 'Change', signin: 'Sign-in' };
export const kindLabel = (k: string) => KIND[k] || k;

export function lastSeen(d: string, t: string) {
  const today = todayPKT();
  return `${d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : fds(d)}, ${t}`;
}

/** Day-grouped list: time, who (initials chip and name), what kind, the project, and what they did. */
export function ActivityList({ list, staff, projects, showProject = true, empty = 'Nothing yet.' }: { list: LogEntry[]; staff: Staff[]; projects: Project[]; showProject?: boolean; empty?: string }) {
  if (!list.length) return <p className="empty">{empty}</p>;
  let day = '';
  return <div className="d-body log-page">{list.map(e => {
    const h = e.d !== day ? (day = e.d, <div className="ev-day">{dow(e.d)} {fd(e.d)}</div>) : null;
    const who = staff.find(s => s.id === e.staffId), name = who?.name || e.by || 'Staff';
    const proj = e.project && showProject ? projects.find(p => p.id === e.project)?.name : null;
    return <div key={e.id}>{h}<div className="ev act-ev"><span className="tm">{e.t}</span><div>
      <div className="act-who"><span className={`act-av${who?.role === 'admin' ? ' admin' : ''}`} aria-hidden="true">{initialsOf(name)}</span><b>{name}</b>{who ? <span className="cell-sub">{who.role === 'admin' ? 'Admin' : 'Accountant'}</span> : null}<span className={`k ${e.kind}`}>{kindLabel(e.kind)}</span>{proj ? <span className="cell-sub">{proj}</span> : null}</div>
      <div className="act-text">{e.text}{e.ownerId && e.project ? <> <a className="act-open" href={`/p/${e.project}/apartments/${e.ownerId}`}>Open apartment</a></> : null}</div></div></div></div>;
  })}</div>;
}
