// To do (Nov 2026). Since 25 Nov 2026 all of it is the Accountant's (building managers only enter payments): his
// building managers' entries to approve one by one, receipts not sent (?v=receipts) and the rest: WhatsApp to send,
// vouchers, numbers, follow-ups, meter readings (?v=todo). Admins watch the same list, with a filter per accountant.
import { requireStaff, roleName } from '@/lib/session';
import { redirect } from 'next/navigation';
import { getStore } from '@/lib/store';
import { projects as listProjects, load } from '@/lib/ops';
import { projectTasks, responsible, myTasks, accountantSees, type Task } from '@/lib/tasks';
import { use, ownerById } from '@/lib/engine';
import { bulkApproveAction, rejectEntryAction } from '@/lib/actions-cash';
import { BulkSelect } from '@/components/BulkSelect';
import { Go, Submit, PickSubmit } from '@/components/client';
import { fd, fds, rs, todayPKT, diff, t12, periodText } from '@/lib/fmt';
import { PageIc, Empty } from '@/components/views/art';
import { Ic, Wa } from '@/components/icons';
import { PhotoLink } from '@/components/views/bits';

export const dynamic = 'force-dynamic';

const status = (t: Task, today: string) => t.overdue
  ? <span className="tag bad">Late · {diff(today, t.deadline)} day{diff(today, t.deadline) === 1 ? '' : 's'}</span>
  : t.deadline === today ? <span className="tag warn">Due today</span> : <span className="tag info">Open</span>;


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
      {/* Someone else's task (21 Nov 2026): shown to follow up, but only the person responsible opens and does it. */}
      <td className="r">{showWho ? <span className="tag" title="Done by the person responsible">{t.role === 'manager' ? 'Building manager\'s task' : 'Accountant\'s task'}</span> : <Go href={t.href} className="btn sm">Open</Go>}</td>
    </tr>)}
  </tbody></table></div>;
}

export default async function Tasks({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, v = sp.v || '';
  const me = await requireStaff(), store = await getStore(), staff = await store.listStaff(), today = todayPKT();
  if (me.role === 'manager') redirect('/');
  const live = (await listProjects(me)).filter(p => p.live);
  const states = await Promise.all(live.map(p => load(p.id, me)));
  const all = states.flatMap(s => projectTasks(s)).sort((a, b) => (+(b.kind === 'receipt') - +(a.kind === 'receipt')) || (+b.overdue - +a.overdue) || a.deadline.localeCompare(b.deadline));
  const acc = all.filter(t => t.role === 'accountant'), mine = myTasks(all, me);
  const late = (l: Task[]) => l.filter(t => t.overdue).length;
  const head = (title: string, sub: string, ic: [string, 'rust' | 'green'] = ['clip', 'rust']) => <><div className="proj-head"><PageIc n={ic[0]} tone={ic[1]} /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">{title}</div></div><div className="crumb-path">Dashboard<span>/</span>{title}</div></div><p className="muted" style={{ margin: 0 }}>{sub}</p></>;

  const tabs = (list: [string, string, number, number][], on = v) => <nav className="proj-tabs" aria-label="To do lists">{list.map(([k, l, n, lt]) =>
    <Go key={k} href={k ? `/tasks?v=${k}` : '/tasks'} current={on === k}>{l}{n ? <> <span className={lt ? 'tab-b' : 'tab-new'} title={`${n} open${lt ? `, ${lt} late` : ''}`}>{n}</span></> : null}</Go>)}</nav>;

  if (me.role === 'admin') {
    // One list (25 Nov 2026), with a filter per accountant: the tasks in the buildings he looks after.
    const accs = staff.filter(x => x.role === 'accountant' && x.active && !x.leftOn), pick = accs.find(x => x.id === sp.a);
    const list = pick ? acc.filter(t => accountantSees(pick, t.project, staff)) : acc;
    return <>
      {head('Team To do', 'What the accountants still have to do. You only watch these: each task is done by the accountant responsible.')}
      {accs.length > 1 ? <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 12px' }}>
        <a href="/tasks" className={'chipbtn' + (!pick ? ' on' : '')}>All accountants</a>
        {accs.map(x => { const n = acc.filter(t => accountantSees(x, t.project, staff)).length; return <a key={x.id} href={`/tasks?a=${encodeURIComponent(x.id)}`} className={'chipbtn' + (pick?.id === x.id ? ' on' : '')}>{x.name}{n ? ` · ${n}` : ''}</a>; })}
      </div> : null}
      <div className="card"><div className="card-row"><h3>Pending accountant tasks{pick ? ` · ${pick.name}` : ''} <small>{list.length} open{late(list) ? ` · ${late(list)} late` : ''}</small></h3></div><Table list={list} staff={staff} today={today} showWho /></div>
    </>;
  }

  if (me.role === 'accountant') {
    const proofs = states.flatMap(s => use(s, () => s.proofs.filter(p => p.status === 'pending').map(p => ({ p, o: ownerById(p.ownerId), s }))));
    const cashT = acc.filter(t => t.id.startsWith('cash')), myN = proofs.length + cashT.length;
    // Receipts newest first: a receipt here is one the building manager didn't send (he cancelled, or has no number).
    const rcpt = mine.filter(t => t.kind === 'receipt').sort((a, b) => `${b.since} ${b.time || ''}`.localeCompare(`${a.since} ${a.time || ''}`));
    const rest = mine.filter(t => t.kind !== 'receipt' && !t.id.startsWith('proof:') && !t.id.startsWith('cash'));
    const accTabs = tabs([['', 'Approve entries', myN, late(cashT)], ['receipts', 'Receipts to send', rcpt.length, late(rcpt)], ['todo', 'Other To do', rest.length, late(rest)]]);
    if (v === 'receipts') return <>
      {head('Receipts to send', 'Receipts the building manager didn\'t send from his screen (he pressed Cancel, or the customer has no WhatsApp number). Send each one to the customer.', ['receipt', 'green'])}
      {accTabs}
      {live.map(p => { const l = rcpt.filter(t => t.project === p.id); if (!l.length && live.length > 1) return null;
        return <div className="card rc-card" key={p.id}><div className="card-row"><h3 data-hic="receipt" data-tone="green">{p.name} <small>{l.length} receipt{l.length === 1 ? '' : 's'} to send{late(l) ? ` · ${late(l)} from earlier days` : ''}</small></h3>
          {l.length > 1 ? <Go href={`/p/${p.id}/send?type=queue&kind=receipt&go=1`} className="btn sm wa"><Wa /> Send all {l.length}, one by one</Go> : null}</div>
          {l.length ? <div className="list rc-list">{l.map(t => <div className={'li rc-li' + (t.overdue ? ' late' : '')} key={t.id}>
            <span className="rc-ic" aria-hidden="true"><Ic n="receipt" s={20} /></span>
            <div className="t"><div className="a"><span className="apt-t">{t.apt}</span> · {t.owner}</div><div className="b">{t.detail}</div></div>
            <div className="rc-when"><b>{t.since === today ? (t.time ? t12(t.time) : 'Today') : fds(t.since)}</b>{t.overdue ? <span className="tag bad">Waiting since {fds(t.since)}</span> : <span className="tag good">Send now</span>}</div>
            <Go href={t.href} className="btn sm wa"><Wa /> Send receipt</Go></div>)}</div>
            : <Empty kind="done" small title="No receipts waiting">Receipts the building managers don&apos;t send come here.</Empty>}
        </div>; })}
      {live.length > 1 && !rcpt.length ? <Empty card kind="done" title="No receipts waiting">Receipts the building managers don&apos;t send come here.</Empty> : null}
    </>;
    if (v === 'todo') return <>
      {head('Other To do', 'Bills, reminders and notices to send on WhatsApp, printed vouchers, numbers to fix, promises and instalments to follow up, meter readings. Open a task to do it.')}
      {accTabs}
      {live.map(p => { const l = rest.filter(t => t.project === p.id); return <div className="card" key={p.id}><div className="card-row"><h3>{p.name} <small>{l.length} open{late(l) ? ` · ${late(l)} late` : ''}</small></h3><Go href={`/p/${p.id}/todo`} className="btn sm">Open building To do</Go></div><Table list={l} staff={staff} today={today} showWho={false} /></div>; })}
    </>;
    return <>
      {head('To do', 'Payments building managers entered (cash or bank transfer). Each already counts for the customer, who has the receipt. Approve the ones whose money you have received; "Not received" takes the payment back and sends it to the building manager to put right.')}
      {accTabs}
      {(() => {
        const f = (sp.m === 'cash' ? 'Cash' : sp.m === 'bank' ? 'Bank transfer' : ''), b = sp.b || '';
        const list = proofs.filter(x => (!f || (x.p.method || 'Cash') === f) && (!b || x.s.project === b)), tot = list.reduce((a, x) => a + x.p.amount, 0);
        const q = (k: Record<string, string>) => '/tasks?' + new URLSearchParams(Object.entries({ m: sp.m || '', b, ...k }).filter(([, x]) => x)).toString();
        return <form action={bulkApproveAction} className="card" id="entries"><input type="hidden" name="back" value="/tasks" /><input type="hidden" name="one" value="" />
          <div className="card-row"><h3>Entries to approve <small>{proofs.length} waiting · {rs(proofs.reduce((a, x) => a + x.p.amount, 0))}</small></h3>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><a className="btn sm" href={`/api/export/entries${b ? `?project=${b}` : ''}`}><Ic n="download" s={15} /> Download Excel</a></div></div>
          <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 10px' }}>
            {[['', 'All'], ['cash', 'Cash'], ['bank', 'Bank transfer']].map(([k, l]) => <a key={k} href={q({ m: k })} className={'chipbtn' + ((sp.m || '') === k ? ' on' : '')}>{l}</a>)}
            {live.length > 1 ? live.map(pj => <a key={pj.id} href={q({ b: b === pj.id ? '' : pj.id })} className={'chipbtn' + (b === pj.id ? ' on' : '')}>{pj.name}</a>) : null}
          </div>
          {list.length ? <><div className="bulk-bar"><BulkSelect /><Submit className="btn primary">Approve selected</Submit></div>
            <div className="list">{list.map(({ p, o, s }) => <div className="li bulk-row" data-bulk-row key={p.id} id={`proof-${p.id}`}>
              <input type="checkbox" name="e" value={`${s.project}:${p.id}`} data-amt={p.amount} aria-label={`Approve ${o.apt}, ${rs(p.amount)}`} />
              <div className="t"><div className="a"><span className="apt-t">{o.apt}</span> · <span className="num">{rs(p.amount)}</span> {(p.method || 'Cash') === 'Bank transfer' ? <span className="tag info">Bank transfer</span> : <span className="tag warn">Cash</span>}{p.forWhat === 'electricity' ? <> <span className="tag">Electricity</span></> : null}</div>
                <div className="b">{o.name} · {s.proj.name} · entered by <b>{p.byName}</b> {fd(p.d)}{p.paidOn ? `, paid ${fd(p.paidOn)}` : ''}{p.periodFrom ? ` · for ${periodText(p.periodFrom, p.periodTo)}` : ''}{p.ref ? ` · receipt ${p.ref}` : ''}{p.txn ? ` · transaction ${p.txn}` : ''}{p.note ? ` · ${p.note}` : ''}{p.photoId ? <> · <PhotoLink pid={s.project} id={p.photoId} label="Photo of the payment" /></> : null}</div></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <input name={`reply-${p.id}`} type="text" placeholder="Why (for the manager)" aria-label="Why it wasn't received" style={{ width: 170 }} />
                <PickSubmit action={rejectEntryAction} field="one" value={`${s.project}:${p.id}`}>Not received</PickSubmit>
              </div></div>)}</div>
            <p className="cell-sub" style={{ margin: '10px 0 0' }}>Showing {list.length} · {rs(tot)}. Approving confirms you have the money: nothing new goes to the customer (the receipt went when the payment was entered). Approved cash is then with you, ready for the bank deposit on the Payments page.</p></>
            : <Empty kind="inbox" small title={`Nothing to approve${f || b ? ' with these filters' : ''}`} />}
        </form>;
      })()}
      {(() => { const cash = cashT; return cash.length ? <div className="card"><div className="card-row"><h3>Cash to receive and deposit <small>{cash.length} open{late(cash) ? ` · ${late(cash)} late` : ''}</small></h3><Go href="/payments?via=Cash#deposit" className="btn sm">Open Payments</Go></div><Table list={cash} staff={staff} today={today} showWho={false} /></div> : null; })()}
    </>;
  }

  return null;
}
