// To do, by role (Nov 2026). Building managers: their own work for their buildings. Accountants: money to check,
// plus a read-only view of the building managers' lists. Admins: both lists, to monitor who is responsible and
// what is late (they don't do these tasks themselves).
// 18 Nov 2026: each list is its own page (tabs): the Accountant's own To do and the building managers' To do are
// separate (?v=managers); the Admin's Team To do has Building managers and Accountants (?v=accountants).
import { requireStaff, roleName } from '@/lib/session';
import { getStore } from '@/lib/store';
import { projects as listProjects, load } from '@/lib/ops';
import { projectTasks, responsible, myTasks, type Task } from '@/lib/tasks';
import { use, ownerById } from '@/lib/engine';
import { bulkApproveAction, rejectEntryAction } from '@/lib/actions-cash';
import { BulkSelect } from '@/components/BulkSelect';
import { Go, Submit } from '@/components/client';
import { fd, fds, rs, todayPKT, diff } from '@/lib/fmt';
import { PageIc, Empty } from '@/components/views/art';
import { Ic } from '@/components/icons';

export const dynamic = 'force-dynamic';

const status = (t: Task, today: string) => t.overdue
  ? <span className="tag bad">Late · {diff(today, t.deadline)} day{diff(today, t.deadline) === 1 ? '' : 's'}</span>
  : t.deadline === today ? <span className="tag warn">Due today</span> : <span className="tag info">Open</span>;

/** Someone watching another person's task (the Admin, or the Accountant following a building manager) opens where
 *  they can see it, not the screen where it is done: sending is the building manager's, so it opens Messages. */
const watchHref = (t: Task) => t.href.includes('/send') ? `/p/${t.project}/messages` : t.href.replace(/\?m=fix&from=todo$/, '');

function Table({ list, staff, today, showWho }: { list: Task[]; staff: Awaited<ReturnType<Awaited<ReturnType<typeof getStore>>['listStaff']>>; today: string; showWho: boolean }) {
  if (!list.length) return <Empty kind="done" small title="Nothing pending" />;
  return <div className="tbl-wrap"><table className="task-tbl"><thead><tr><th>Task</th><th>Building</th><th>Customer</th>{showWho ? <th>Responsible</th> : null}<th>Since</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>
    {list.map(t => <tr key={t.id}>
      <td data-l="Task"><b>{t.what}</b><div className="cell-sub">{t.detail}</div></td>
      <td data-l="Building">{t.pname}</td>
      <td data-l="Customer">{t.apt ? <><b>{t.apt}</b><div className="cell-sub">{t.owner}</div></> : <span className="cell-sub">Several owners</span>}</td>
      {showWho ? <td data-l="Responsible">{responsible(t, staff)}</td> : null}
      <td data-l="Since" style={{ whiteSpace: 'nowrap' }}>{fds(t.since)}</td>
      <td data-l="Deadline" style={{ whiteSpace: 'nowrap' }}>{fds(t.deadline)}</td>
      <td data-l="Status">{status(t, today)}</td>
      <td className="r"><Go href={showWho ? watchHref(t) : t.href} className="btn sm">Open</Go></td>
    </tr>)}
  </tbody></table></div>;
}

export default async function Tasks({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, v = sp.v || '';
  const me = await requireStaff(), store = await getStore(), staff = await store.listStaff(), today = todayPKT();
  const live = (await listProjects(me)).filter(p => p.live);
  const states = await Promise.all(live.map(p => load(p.id, me)));
  const all = states.flatMap(s => projectTasks(s)).sort((a, b) => (+b.overdue - +a.overdue) || a.deadline.localeCompare(b.deadline));
  const mgr = all.filter(t => t.role === 'manager'), acc = all.filter(t => t.role === 'accountant'), mine = myTasks(all, me);
  const late = (l: Task[]) => l.filter(t => t.overdue).length;
  const head = (title: string, sub: string) => <><div className="proj-head"><PageIc n="clip" tone="rust" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">{title}</div></div><div className="crumb-path">Dashboard<span>/</span>{title}</div></div><p className="muted" style={{ margin: 0 }}>{sub}</p></>;

  const tabs = (list: [string, string, number, number][]) => <nav className="proj-tabs" aria-label="To do lists">{list.map(([k, l, n, lt]) =>
    <Go key={k} href={k ? `/tasks?v=${k}` : '/tasks'} current={v === k}>{l}{n ? <> <span className={lt ? 'tab-b' : 'tab-new'} title={`${n} open${lt ? `, ${lt} late` : ''}`}>{n}</span></> : null}</Go>)}</nav>;

  if (me.role === 'admin') {
    const accView = v === 'accountants';
    return <>
      {head('Team To do', 'What the building managers and the accountants still have to do. You only watch these: each task is done by the person responsible.')}
      {tabs([['', 'Building managers', mgr.length, late(mgr)], ['accountants', 'Accountants', acc.length, late(acc)]])}
      {accView
        ? <div className="card"><div className="card-row"><h3>Pending accountant tasks <small>{acc.length} open{late(acc) ? ` · ${late(acc)} late` : ''}</small></h3></div><Table list={acc} staff={staff} today={today} showWho /></div>
        : <div className="card"><div className="card-row"><h3>Pending building manager tasks <small>{mgr.length} open{late(mgr) ? ` · ${late(mgr)} late` : ''}</small></h3></div><Table list={mgr} staff={staff} today={today} showWho /></div>}
    </>;
  }

  if (me.role === 'accountant') {
    const proofs = states.flatMap(s => use(s, () => s.proofs.filter(p => p.status === 'pending').map(p => ({ p, o: ownerById(p.ownerId), s }))));
    const cashT = acc.filter(t => t.id.startsWith('cash')), myN = proofs.length + cashT.length;
    const accTabs = tabs([['', 'Your To do', myN, late(acc)], ['managers', 'Building managers\' To do', mgr.length, late(mgr)]]);
    if (v === 'managers') return <>
      {head('Building managers\' To do', 'What the building managers still have to do in their buildings. You follow these up; each task is done by the building manager.')}
      {accTabs}
      <div className="card"><div className="card-row"><h3>Building managers&apos; To do <small>{mgr.length} open{late(mgr) ? ` · ${late(mgr)} late` : ''}</small></h3></div><Table list={mgr} staff={staff} today={today} showWho /></div>
    </>;
    return <>
      {head('To do', 'Payments building managers entered (cash or bank transfer). Tick the ones you have received and approve them; an owner\'s balance changes only then.')}
      {accTabs}
      {(() => {
        const f = (sp.m === 'cash' ? 'Cash' : sp.m === 'bank' ? 'Bank transfer' : ''), b = sp.b || '';
        const list = proofs.filter(x => (!f || (x.p.method || 'Cash') === f) && (!b || x.s.project === b)), tot = list.reduce((a, x) => a + x.p.amount, 0);
        const q = (k: Record<string, string>) => '/tasks?' + new URLSearchParams(Object.entries({ m: sp.m || '', b, ...k }).filter(([, x]) => x)).toString();
        return <form action={bulkApproveAction} className="card" id="entries"><input type="hidden" name="back" value="/tasks" />
          <div className="card-row"><h3>Entries to approve <small>{proofs.length} waiting · {rs(proofs.reduce((a, x) => a + x.p.amount, 0))}</small></h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><a className="btn sm" href={`/api/export/entries${b ? `?project=${b}` : ''}`}><Ic n="download" s={15} /> Download CSV</a></div></div>
          <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 10px' }}>
            {[['', 'All'], ['cash', 'Cash'], ['bank', 'Bank transfer']].map(([k, l]) => <a key={k} href={q({ m: k })} className={'chipbtn' + ((sp.m || '') === k ? ' on' : '')}>{l}</a>)}
            {live.length > 1 ? live.map(pj => <a key={pj.id} href={q({ b: b === pj.id ? '' : pj.id })} className={'chipbtn' + (b === pj.id ? ' on' : '')}>{pj.name}</a>) : null}
          </div>
          {list.length ? <><div className="bulk-bar"><BulkSelect /><Submit className="btn primary">Approve selected</Submit></div>
            <div className="list">{list.map(({ p, o, s }) => <div className="li bulk-row" data-bulk-row key={p.id} id={`proof-${p.id}`}>
              <input type="checkbox" name="e" value={`${s.project}:${p.id}`} data-amt={p.amount} aria-label={`Approve ${o.apt}, ${rs(p.amount)}`} />
              <div className="t"><div className="a"><span className="apt-t">{o.apt}</span> · <span className="num">{rs(p.amount)}</span> {(p.method || 'Cash') === 'Bank transfer' ? <span className="tag info">Bank transfer</span> : <span className="tag warn">Cash</span>}{p.forWhat === 'electricity' ? <> <span className="tag">Electricity</span></> : null}</div>
                <div className="b">{o.name} · {s.proj.name} · entered by <b>{p.byName}</b> {fd(p.d)}{p.paidOn ? `, paid ${fd(p.paidOn)}` : ''}{p.ref ? ` · receipt ${p.ref}` : ''}{p.txn ? ` · transaction ${p.txn}` : ''}{p.note ? ` · ${p.note}` : ''}</div></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input name={`reply-${p.id}`} type="text" placeholder="Why (for the manager)" aria-label="Why it wasn't received" style={{ width: 170 }} />
                <button type="submit" formAction={rejectEntryAction} formNoValidate name="one" value={`${s.project}:${p.id}`} className="btn sm">Not received</button>
              </div></div>)}</div>
            <p className="cell-sub" style={{ margin: '10px 0 0' }}>Showing {list.length} · {rs(tot)}. Approving records each payment, makes its receipt and puts &quot;send receipt&quot; in the building manager&apos;s To do. Approved cash is then with you, ready for the bank deposit on the Cash page.</p></>
            : <Empty kind="inbox" small title={`Nothing to approve${f || b ? ' with these filters' : ''}`} />}
        </form>;
      })()}
      {(() => { const cash = cashT; return cash.length ? <div className="card"><div className="card-row"><h3>Cash to receive and deposit <small>{cash.length} open{late(cash) ? ` · ${late(cash)} late` : ''}</small></h3><Go href="/cash" className="btn sm">Open Cash</Go></div><Table list={cash} staff={staff} today={today} showWho={false} /></div> : null; })()}
    </>;
  }

  // Building manager: their own list, building by building.
  return <>
    {head('To do', 'Your work for your buildings: messages to send on WhatsApp, numbers to fix and promises to follow up. Open a task to do it.')}
    {live.length ? live.map(p => { const l = mine.filter(t => t.project === p.id); return <div className="card" key={p.id}><div className="card-row"><h3>{p.name} <small>{l.length} open{late(l) ? ` · ${late(l)} late` : ''}</small></h3><Go href={`/p/${p.id}/todo`} className="btn sm">Open building To do</Go></div><Table list={l} staff={staff} today={today} showWho={false} /></div>; })
      : <div className="card allclear"><div className="big">No buildings assigned yet</div><p className="muted">Ask the Admin to assign your buildings.</p></div>}
  </>;
}
