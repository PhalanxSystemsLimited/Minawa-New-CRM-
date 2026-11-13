// Approvals: accountants' changes to what owners are charged (discounts, generator charges, billing plan, monthly fee,
// adjustments). Admins approve or reject them; an accountant sees their own requests and what was decided.
import { requireStaff } from '@/lib/session';
import { projects as listProjects, load } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { Go } from '@/components/client';
import { ApprovalItem, type ApprovalView } from '@/components/views/approvals';
import { addDays, todayPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

export default async function Approvals({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const me = await requireStaff(), admin = me.role === 'admin', sp = await searchParams;
  const show = sp.s === 'done' ? 'done' : 'waiting', back = `/approvals${show === 'done' ? '?s=done' : ''}`;
  const projs = (await listProjects()).filter(p => p.live);
  const states = await Promise.all(projs.map(p => load(p.id, me)));
  const all: ApprovalView[] = states.flatMap(s => use(s, () => s.approvals.filter(a => admin || a.byId === me.id)
    .map(a => { const o = a.ownerId ? ownerById(a.ownerId) : null; return { a, apt: o?.apt || '', owner: o?.name || '', pname: s.proj.name }; })));
  const at = (v: ApprovalView) => v.a.d + ' ' + v.a.t, dec = (v: ApprovalView) => (v.a.decidedD || '') + ' ' + (v.a.decidedT || '');
  const waiting = all.filter(v => v.a.status === 'pending').sort((x, y) => at(x).localeCompare(at(y)));
  const done = all.filter(v => v.a.status !== 'pending').sort((x, y) => dec(y).localeCompare(dec(x)));
  const since = addDays(todayPKT(), -29), recent = done.filter(v => (v.a.decidedD || '') >= since);
  const n = (st: string) => recent.filter(v => v.a.status === st).length;
  const list = show === 'done' ? done.slice(0, 100) : waiting;
  return <>
    <div className="proj-head"><div><div className="eyebrow-b">Minawa Group</div><div className="proj-title">Approvals</div></div><div className="crumb-path">Dashboard<span>/</span>Approvals</div></div>
    <div className="page-head"><div><p>{admin
      ? <>When an accountant changes what an owner is charged (a discount, generator charges, the billing plan, the flat&apos;s monthly fee or an adjustment), the change waits here. It applies only when an admin approves it. Changes made by admins apply straight away.</>
      : <>Changes you make to what an owner is charged (a discount, generator charges, the billing plan, the flat&apos;s monthly fee or an adjustment) wait for an admin&apos;s approval. Here you can see what is waiting and what was decided.</>}</p></div></div>
    <div className="kpis apv-kpis">
      <div className="kpi"><div className="l">Waiting</div><div className="v num">{waiting.length}</div><div className="cell-sub">{admin ? 'for your approval' : 'for an admin'}</div></div>
      <div className="kpi"><div className="l">Approved</div><div className="v num">{n('approved')}</div><div className="cell-sub">last 30 days</div></div>
      <div className="kpi"><div className="l">Rejected</div><div className="v num">{n('rejected')}</div><div className="cell-sub">last 30 days</div></div>
    </div>
    <div className="card">
      <div className="ptabs" role="tablist" style={{ marginBottom: 14 }}>
        <Go href="/approvals" current={show === 'waiting' ? 'true' : 'false'} replace>Waiting{waiting.length ? ` (${waiting.length})` : ''}</Go>
        <Go href="/approvals?s=done" current={show === 'done' ? 'true' : 'false'} replace>Decided</Go>
      </div>
      {list.length ? <div className="apv-list">{list.map(v => <ApprovalItem key={v.a.project + v.a.id} v={v} admin={admin} meId={me.id} back={back} />)}</div>
        : <p className="empty">{show === 'done' ? 'Nothing decided yet.' : admin ? 'Nothing is waiting for your approval.' : 'None of your changes are waiting.'}</p>}
    </div>
  </>;
}
