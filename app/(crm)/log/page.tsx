// Activity: everything the system and staff did, in one place (it replaces the separate "Staff activity" page).
// Admins can narrow it to staff only, accountants, admins or one person; everyone can filter by kind and project.
import { requireStaff } from '@/lib/session';
import { getStore } from '@/lib/store';
import { projects as listProjects } from '@/lib/ops';
import { GoSelect, Go } from '@/components/client';
import { ActivityList, initialsOf, lastSeen, roleTag } from '@/components/views/activity';

export const dynamic = 'force-dynamic';
const GROUPS: Record<string, string[] | null> = { all: null, money: ['payment', 'webhook', 'link'], msg: ['bill', 'message', 'whatsapp'], fine: ['fine', 'flag', 'alert'], change: ['admin', 'job', 'approval'], signin: ['signin', 'signout'] };
// Old filter names (Activity log's "job" and "link") still work.
const ALIAS: Record<string, string> = { job: 'change', link: 'money' };

export default async function Activity({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireStaff(), admin = me.role === 'admin';
  const sp = await searchParams, store = await getStore(), staff = await store.listStaff(), projs = await listProjects();
  const f0 = ALIAS[sp.f] || sp.f, f = f0 && f0 in GROUPS ? f0 : 'all', pid = sp.p || '';
  const who = admin ? sp.who || 'all' : 'all';
  const person = admin ? staff.find(s => s.id === who) : undefined;
  const ids = person ? [person.id] : who === 'accountants' ? staff.filter(s => s.role === 'accountant').map(s => s.id) : who === 'admins' ? staff.filter(s => s.role === 'admin').map(s => s.id) : null;
  const list = await store.getLog({ project: pid || null, kinds: GROUPS[f], limit: 500, staffIds: ids, staffOnly: who === 'staff' });
  const latest = list.filter(e => e.d === list[0]?.d).length;
  const people = [...staff].sort((a, b) => (a.role === b.role ? 0 : a.role === 'accountant' ? -1 : 1) || a.name.localeCompare(b.name));
  const lastOf = person ? list.find(e => e.staffId === person.id) : null;
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">Activity</div></div><div className="crumb-path">Dashboard<span>/</span>Activity</div></div>
    {person ? <div className="card act-person"><span className={`act-av lg${person.role === 'admin' ? ' admin' : ''}`} aria-hidden="true">{initialsOf(person.name)}</span>
      <div><div className="pc-name">{person.name}</div><div className="cell-sub">{person.email}</div></div>{roleTag(person.role)}{person.active ? <span className="tag good">Can sign in</span> : <span className="tag bad">Turned off</span>}
      <div className="act-person-r"><div className="cell-sub">Last active</div><b>{lastOf ? lastSeen(lastOf.d, lastOf.t) : 'Not yet'}</b></div>
      <Go href={`/admin?edit=${encodeURIComponent(person.id)}`} className="btn sm">Edit</Go></div> : null}
    <div className="card"><div className="toolbar" style={{ marginBottom: 14 }}>
      {admin ? <GoSelect name="who" value={who} ariaLabel="Whose activity" style={{ width: 'auto' }} options={[['all', 'Everyone and the system'], ['staff', 'Staff only'], ['accountants', 'All accountants'], ['admins', 'All admins'], ...people.map(s => [s.id, `${s.name} (${s.role === 'admin' ? 'Admin' : 'Accountant'})`] as [string, string])]} /> : null}
      <GoSelect name="f" value={f} ariaLabel="What to show" style={{ width: 'auto' }} options={[['all', 'Everything'], ['money', 'Payments and links'], ['msg', 'Bills, notices and messages'], ['fine', 'Fines, flags and alerts'], ['change', 'Changes, approvals and daily runs'], ['signin', 'Sign-ins and sign-outs']]} />
      <GoSelect name="p" value={pid} ariaLabel="Project" style={{ width: 'auto' }} options={[['', 'All projects'], ...projs.filter(p => p.live).map(p => [p.id, p.name] as [string, string])]} />
      <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{list.length ? `${list.length}${list.length === 500 ? '+' : ''} action${list.length === 1 ? '' : 's'} · ${latest} on the latest day` : ''}</span>
    </div>
      <ActivityList list={list} staff={staff} projects={projs} showProject={!pid} empty={person ? `${person.name} hasn't done anything yet.` : 'Nothing yet.'} />
    </div>
  </>;
}
