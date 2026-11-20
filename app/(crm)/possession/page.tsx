// Missing possession dates (18 Nov 2026): customers with no possession date on file are due on the 1st of each month
// until one is added. Everyone sees the buildings they look after (the Admin all of them) and can add the dates in
// bulk from the office records: the Admin's apply at once, an Accountant's or a Building manager's go to the Admin.
import { requireStaff, roleName } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { use, apartments, aptOrder, balance } from '@/lib/engine';
import { possessionDatesAction } from '@/lib/actions-possession';
import { Go, Submit } from '@/components/client';
import { rs, todayPKT } from '@/lib/fmt';
import { PageIc, KIc, Empty } from '@/components/views/art';
import { Ic } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function Possession({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, me = await requireStaff(), today = todayPKT(), admin = me.role === 'admin';
  const all = await liveProjects(me), pid = all.some(p => p.id === sp.p) ? sp.p! : '', q = (sp.q || '').trim().toLowerCase();
  const states = await Promise.all((pid ? all.filter(p => p.id === pid) : all).map(p => load(p.id, me)));
  const rows = states.flatMap(s => use(s, () => {
    const waiting = new Map(s.approvals.filter(a => a.kind === 'posdate' && a.status === 'pending' && a.ownerId).map(a => [a.ownerId!, String((a.change as Record<string, unknown>).possession || '')]));
    return apartments().filter(o => o.status === 'active' && !o.possessionKnown).sort(aptOrder)
      .map(o => ({ o, pid: s.project, pname: s.proj.name, bal: balance(o), waiting: waiting.get(o.id) || null }));
  })).filter(x => !q || `${x.o.apt} ${x.o.name} ${x.o.block}`.toLowerCase().includes(q));
  const per = new Map<string, number>(); for (const x of rows) per.set(x.pname, (per.get(x.pname) || 0) + 1);
  const back = `/possession?${new URLSearchParams(Object.entries({ p: pid, q: sp.q || '' }).filter(([, v]) => v))}`;
  return <>
    <div className="proj-head"><PageIc n="key" tone="violet" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Possession dates</div></div><div className="crumb-path">Dashboard<span>/</span>Possession dates</div></div>
    <p className="muted" style={{ margin: 0 }}>Customers with no possession date are due on the 1st of each month. Add the date from the office records: from the next bill they are due on their possession day.{admin ? '' : ' Your dates go to the Admin for approval.'}</p>
    <form method="get" className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div className="form-row" style={{ margin: 0 }}><label htmlFor="ps-p">Building</label><select id="ps-p" name="p" defaultValue={pid}><option value="">All your buildings</option>{all.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div className="form-row" style={{ margin: 0 }}><label htmlFor="ps-q">Apartment or name</label><input id="ps-q" name="q" type="search" defaultValue={sp.q || ''} placeholder="e.g. 16B or Aslam" /></div>
      <button type="submit" className="btn">Show</button><span style={{ flex: 1 }} />
      <a className="btn" href={`/api/export/possession${pid ? `?project=${pid}` : ''}`}><Ic n="download" s={15} /> Download Excel</a>
    </form>
    <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
      <div className="kpi"><KIc n="key" tone="violet" /><div className="l">No possession date</div><div className="v num">{rows.length}</div><div className="cell-sub">due on the 1st for now</div></div>
      {[...per].map(([n, c]) => <div className="kpi" key={n}><KIc n="building" tone="rust" /><div className="l">{n}</div><div className="v num">{c}</div><div className="cell-sub">customer{c === 1 ? '' : 's'}</div></div>)}
    </div>
    {rows.length ? <form action={possessionDatesAction} className="card"><input type="hidden" name="back" value={back} />
      <div className="card-row"><h3>Add possession dates <small>fill in the ones you have, then save once</small></h3></div>
      <div className="tbl-wrap"><table><thead><tr><th>Apartment</th><th>Customer</th>{pid ? null : <th>Building</th>}<th className="r">Owes</th><th>Possession date</th></tr></thead><tbody>
        {rows.map(x => <tr key={x.pid + x.o.id}>
          <td><Go href={`/p/${x.pid}/apartments/${x.o.id}`} className="link-btn"><b>{x.o.apt}</b></Go><div className="cell-sub">Block {x.o.block} · {x.o.type}</div></td>
          <td>{x.o.name}</td>{pid ? null : <td>{x.pname}</td>}
          <td className="r num">{rs(Math.max(0, x.bal))}</td>
          <td>{x.waiting ? <span className="tag warn">Waiting for the Admin{x.waiting ? ` · ${x.waiting}` : ''}</span>
            : <input type="date" name={`pd:${x.pid}:${x.o.id}`} max={today} min="1990-01-01" aria-label={`Possession date for ${x.o.apt}`} />}</td></tr>)}
      </tbody></table></div>
      {admin ? null : <div className="form-row" style={{ marginTop: 12 }}><label htmlFor="ps-w">Where the dates come from (for the Admin) <span className="req">(required)</span></label><input id="ps-w" name="why" type="text" required placeholder="e.g. Office possession register, 2019–2026" /></div>}
      <div className="m-actions" style={{ marginTop: 12 }}><span className="muted" style={{ fontSize: 12, marginRight: 'auto', alignSelf: 'center' }}>Bills already made stay as they are; no day is billed twice.</span><Submit>{admin ? 'Save possession dates' : 'Send for approval'}</Submit></div>
    </form> : <Empty card kind={q || pid ? 'search' : 'done'} title="Every customer has a possession date">{q || pid ? 'Nothing matches these filters.' : 'All customers are due on their possession day.'}</Empty>}
  </>;
}
