// Staff activity (admins only): everything each accountant and admin did, by person, project and kind.
import { requireAdmin } from '@/lib/session';
import { getStore } from '@/lib/store';
import { projects as listProjects } from '@/lib/ops';
import { GoSelect, Go } from '@/components/client';
import { ActivityList, initialsOf, lastSeen, roleTag } from '@/components/views/activity';

export const dynamic = 'force-dynamic';
const GROUPS: Record<string, string[] | null> = { all: null, money: ['payment', 'webhook', 'link'], msg: ['message', 'whatsapp', 'bill'], fine: ['fine', 'flag', 'alert'], change: ['admin', 'job', 'approval'], signin: ['signin', 'signout'] };

export default async function StaffActivity({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireAdmin();
  const sp = await searchParams, store = await getStore(), staff = await store.listStaff(), projs = await listProjects();
  const who = sp.who || 'accountants', f = sp.f && sp.f in GROUPS ? sp.f : 'all', pid = sp.p || '';
  const person = staff.find(s => s.id === who);
  const ids = person ? [person.id] : who === 'accountants' ? staff.filter(s => s.role === 'accountant').map(s => s.id) : who === 'admins' ? staff.filter(s => s.role === 'admin').map(s => s.id) : null;
  const list = await store.getLog({ project: pid || null, kinds: GROUPS[f], limit: 500, staffIds: ids, staffOnly: true });
  const today = list.filter(e => e.d === list[0]?.d).length;
  const people = [...staff].sort((a, b) => (a.role === b.role ? 0 : a.role === 'accountant' ? -1 : 1) || a.name.localeCompare(b.name));
  const lastOf = person ? list.find(e => e.staffId === person.id) : null;
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">Staff activity</div></div><div className="crumb-path">Dashboard<span>/</span>Staff &amp; connections<span>/</span>Staff activity</div></div>
    {person ? <div className="card act-person"><span className={`act-av lg${person.role === 'admin' ? ' admin' : ''}`} aria-hidden="true">{initialsOf(person.name)}</span>
      <div><div className="pc-name">{person.name}</div><div className="cell-sub">{person.email}</div></div>{roleTag(person.role)}{person.active ? <span className="tag good">Can sign in</span> : <span className="tag bad">Turned off</span>}
      <div className="act-person-r"><div className="cell-sub">Last active</div><b>{lastOf ? lastSeen(lastOf.d, lastOf.t) : 'Not yet'}</b></div>
      <Go href={`/admin?edit=${encodeURIComponent(person.id)}`} className="btn sm">Edit</Go></div> : null}
    <div className="card"><div className="toolbar" style={{ marginBottom: 14 }}>
      <GoSelect name="who" value={who} ariaLabel="Whose activity" style={{ width: 'auto' }} options={[['accountants', 'All accountants'], ['admins', 'All admins'], ['all', 'Everyone'], ...people.map(s => [s.id, `${s.name} (${s.role === 'admin' ? 'Admin' : 'Accountant'})`] as [string, string])]} />
      <GoSelect name="f" value={f} ariaLabel="What to show" style={{ width: 'auto' }} options={[['all', 'Everything'], ['money', 'Payments and links'], ['msg', 'Bills, notices and messages'], ['fine', 'Fines, flags and alerts'], ['change', 'Changes and setup'], ['signin', 'Sign-ins and sign-outs']]} />
      <GoSelect name="p" value={pid} ariaLabel="Project" style={{ width: 'auto' }} options={[['', 'All projects'], ...projs.filter(p => p.live).map(p => [p.id, p.name] as [string, string])]} />
      <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{list.length ? `${list.length}${list.length === 500 ? '+' : ''} action${list.length === 1 ? '' : 's'} · ${today} on the latest day` : ''}</span>
    </div>
      <ActivityList list={list} staff={staff} projects={projs} showProject={!pid} empty={person ? `${person.name} hasn't done anything yet.` : 'Nothing yet.'} />
    </div>
  </>;
}
