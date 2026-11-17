// To do, by role (Nov 2026). Building managers: their own work for their buildings. Accountants: money to check,
// plus a read-only view of the building managers' lists. Admins: both lists, to monitor who is responsible and
// what is late (they don't do these tasks themselves).
import { requireStaff, roleName } from '@/lib/session';
import { getStore } from '@/lib/store';
import { projects as listProjects, load } from '@/lib/ops';
import { projectTasks, responsible, myTasks, type Task } from '@/lib/tasks';
import { use, ownerById } from '@/lib/engine';
import { verifyAction, rejectAction } from '@/lib/actions';
import { Go, Submit } from '@/components/client';
import { fd, fds, rs, todayPKT, diff } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

const status = (t: Task, today: string) => t.overdue
  ? <span className="tag bad">Late · {diff(today, t.deadline)} day{diff(today, t.deadline) === 1 ? '' : 's'}</span>
  : t.deadline === today ? <span className="tag warn">Due today</span> : <span className="tag info">Open</span>;

function Table({ list, staff, today, showWho }: { list: Task[]; staff: Awaited<ReturnType<Awaited<ReturnType<typeof getStore>>['listStaff']>>; today: string; showWho: boolean }) {
  if (!list.length) return <p className="empty">Nothing pending.</p>;
  return <div className="tbl-wrap"><table className="task-tbl"><thead><tr><th>Task</th><th>Building</th><th>Customer</th>{showWho ? <th>Responsible</th> : null}<th>Since</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>
    {list.map(t => <tr key={t.id}>
      <td data-l="Task"><b>{t.what}</b><div className="cell-sub">{t.detail}</div></td>
      <td data-l="Building">{t.pname}</td>
      <td data-l="Customer">{t.apt ? <><b>{t.apt}</b><div className="cell-sub">{t.owner}</div></> : <span className="cell-sub">Several owners</span>}</td>
      {showWho ? <td data-l="Responsible">{responsible(t, staff)}</td> : null}
      <td data-l="Since" style={{ whiteSpace: 'nowrap' }}>{fds(t.since)}</td>
      <td data-l="Deadline" style={{ whiteSpace: 'nowrap' }}>{fds(t.deadline)}</td>
      <td data-l="Status">{status(t, today)}</td>
      <td className="r"><Go href={t.href} className="btn sm">Open</Go></td>
    </tr>)}
  </tbody></table></div>;
}

export default async function Tasks() {
  const me = await requireStaff(), store = await getStore(), staff = await store.listStaff(), today = todayPKT();
  const live = (await listProjects(me)).filter(p => p.live);
  const states = await Promise.all(live.map(p => load(p.id, me)));
  const all = states.flatMap(s => projectTasks(s)).sort((a, b) => (+b.overdue - +a.overdue) || a.deadline.localeCompare(b.deadline));
  const mgr = all.filter(t => t.role === 'manager'), acc = all.filter(t => t.role === 'accountant'), mine = myTasks(all, me);
  const late = (l: Task[]) => l.filter(t => t.overdue).length;
  const head = (title: string, sub: string) => <><div className="proj-head"><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">{title}</div></div><div className="crumb-path">Dashboard<span>/</span>{title}</div></div><p className="muted" style={{ margin: 0 }}>{sub}</p></>;

  if (me.role === 'admin') return <>
    {head('Team To do', 'What the building managers and the accountants still have to do. You only watch these: each task is done by the person responsible.')}
    <div className="card"><div className="card-row"><h3>Pending building manager tasks <small>{mgr.length} open{late(mgr) ? ` · ${late(mgr)} late` : ''}</small></h3></div><Table list={mgr} staff={staff} today={today} showWho /></div>
    <div className="card"><div className="card-row"><h3>Pending accountant tasks <small>{acc.length} open{late(acc) ? ` · ${late(acc)} late` : ''}</small></h3></div><Table list={acc} staff={staff} today={today} showWho /></div>
  </>;

  if (me.role === 'accountant') {
    const proofs = states.flatMap(s => use(s, () => s.proofs.filter(p => p.status === 'pending').map(p => ({ p, o: ownerById(p.ownerId), s }))));
    return <>
      {head('To do', 'Money to check. Bank transfers owners send as a screenshot wait here until you find them in the bank statement.')}
      <div className="card"><div className="card-row"><h3>Check these bank transfers <small>{proofs.length} waiting</small></h3></div>
        {proofs.length ? <div className="list">{proofs.map(({ p, o, s }) => <div className="li" key={p.id} id={`proof-${p.id}`}><div className="t"><div className="a"><span className="apt-t">{o.apt}</span> · <span className="num">{rs(p.amount)}</span></div><div className="b">{o.name} · {s.proj.name} · sent {fd(p.d)}</div></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <form action={verifyAction}><input type="hidden" name="pid" value={s.project} /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="amt" value={p.amount} /><input type="hidden" name="back" value="/tasks" /><Submit className="btn sm primary">It&apos;s in the bank</Submit></form>
            <form action={rejectAction}><input type="hidden" name="pid" value={s.project} /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="back" value="/tasks" /><Submit className="btn sm">Can&apos;t find it</Submit></form>
          </div></div>)}</div> : <p className="empty">Nothing to check.</p>}
      </div>
      <div className="card"><div className="card-row"><h3>Building managers&apos; To do <small>to follow up · {mgr.length} open{late(mgr) ? ` · ${late(mgr)} late` : ''}</small></h3></div><Table list={mgr} staff={staff} today={today} showWho /></div>
    </>;
  }

  // Building manager: their own list, building by building.
  return <>
    {head('To do', 'Your work for your buildings: messages to send on WhatsApp, numbers to fix and promises to follow up. Open a task to do it.')}
    {live.length ? live.map(p => { const l = mine.filter(t => t.project === p.id); return <div className="card" key={p.id}><div className="card-row"><h3>{p.name} <small>{l.length} open{late(l) ? ` · ${late(l)} late` : ''}</small></h3><Go href={`/p/${p.id}/todo`} className="btn sm">Open building To do</Go></div><Table list={l} staff={staff} today={today} showWho={false} /></div>; })
      : <div className="card allclear"><div className="big">No buildings assigned yet</div><p className="muted">Ask the Admin to assign your buildings.</p></div>}
  </>;
}
