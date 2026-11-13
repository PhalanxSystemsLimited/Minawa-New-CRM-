// Apartments (the demo's viewOwners): filters, search, sortable table.
import { cur, apartments, ownerStatus, balance, accountsOf, aptOrder, type OwnerStatus } from '@/lib/engine';
import { rs } from '@/lib/fmt';
import type { Owner } from '@/lib/types';
import { PLAN_LABEL } from '@/lib/types';
import { Go, GoRow, LiveSearch } from '@/components/client';
import { projectPage, projHead } from '@/components/views/project';
import { pill, ownerSince, ownerHref } from '@/components/views/bits';

export const dynamic = 'force-dynamic';

export default async function Apartments({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), P = `/p/${pid}/apartments`;
    const filter = sp.f || 'all', q = (sp.q || '').trim().toLowerCase(), k = sp.sort || 'apt', dir = sp.dir === '-1' ? -1 : 1;
    const apts = apartments(), counts: Record<string, number> = {};
    apts.forEach(o => { const s = ownerStatus(o); counts[s] = (counts[s] || 0) + 1; });
    const owing = (counts.due || 0) + (counts.overdue || 0) + (counts.flagged || 0), withFee = apts.filter(o => (o.feeDue || 0) > 0).length;
    const f: [string, string, number][] = [['all', 'All', apts.length], ['owing', 'Owe money', owing], ['fee', 'Fine', withFee], ['flagged', 'Flagged', counts.flagged || 0], ['paid', 'Paid up', counts.paid || 0], ['exempt', 'Exempt', counts.exempt || 0]];
    const owes = (s: OwnerStatus) => s === 'due' || s === 'overdue' || s === 'flagged';
    const fits = (o: Owner) => filter === 'all' || (filter === 'owing' ? owes(ownerStatus(o)) : filter === 'fee' ? (o.feeDue || 0) > 0 : ownerStatus(o) === filter);
    const hay = (o: Owner) => `${o.apt} ${accountsOf(o).map(x => `${x.name} ${x.phone}`).join(' ')}`.toLowerCase();
    const rank: Record<string, number> = { flagged: 0, overdue: 1, due: 2, paid: 3, exempt: 4, transferred: 5 };
    const val = ({ owner: (o: Owner) => o.name.toLowerCase(), bal: (o: Owner) => balance(o), status: (o: Owner) => rank[ownerStatus(o)] ?? 9 } as Record<string, (o: Owner) => string | number>)[k];
    const cmp = val ? (a: Owner, b: Owner) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || aptOrder(a, b); } : (a: Owner, b: Owner) => aptOrder(a, b) * dir;
    const rows = apts.filter(o => fits(o) && (!q || hay(o).includes(q))).sort(cmp);
    const qs = (o: Record<string, string>) => { const u = new URLSearchParams(); const all = { f: filter, q: sp.q || '', sort: k, dir: String(dir), ...o }; Object.entries(all).forEach(([a, b]) => { if (b && !(a === 'f' && b === 'all') && !(a === 'sort' && b === 'apt') && !(a === 'dir' && b === '1')) u.set(a, b); }); const s = u.toString(); return P + (s ? '?' + s : ''); };
    // First click: apartment and owner A–Z, balance highest first, status most urgent first; again reverses.
    const sortTh = (key: string, label: string, cls?: string) => {
      const on = k === key, first = key === 'bal' ? -1 : 1, next = on ? -dir : first;
      return <th className={cls || ''} aria-sort={on ? (dir > 0 ? 'ascending' : 'descending') : 'none'}><Go href={qs({ sort: key, dir: String(next) })} className="th-sort" title={`Sort by ${label.toLowerCase()}`} replace>{label}<span className="sort-ic" aria-hidden="true">{on ? (dir > 0 ? '▲' : '▼') : '↕'}</span></Go></th>;
    };
    return <>
      {projHead('owners')}
      <div className="page-head"><div><h2>Apartments</h2><p>{apts.length} apartments at {S.proj.name}. Tap one for its bills, payments and owners.</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{S.role === 'admin' ? <Go href={`/p/${pid}/setup`} className="btn">Import owners</Go> : null}<Go href={`${P}?m=possession`} className="btn primary">+ New possession</Go></div></div>
      <div className="card"><div className="toolbar" style={{ marginBottom: 14 }}>
        <LiveSearch name="q" id="search" placeholder="Search apartment or owner" ariaLabel="Search apartments" defaultValue={sp.q || ''} />
        {f.map(([key, l, n]) => <Go key={key} href={qs({ f: key })} className="chipbtn" pressed={filter === key} replace>{l} <span className="n">{n}</span></Go>)}
      </div><div id="ownersTable">
        {!rows.length ? <p className="empty">No apartments match. Clear the search or pick another filter.</p> :
          <div className="tbl-wrap"><table className="sortable"><thead><tr>{sortTh('apt', 'Apartment')}{sortTh('owner', 'Owner')}{sortTh('bal', 'Balance', 'r')}{sortTh('status', 'Status')}</tr></thead><tbody>
            {rows.map(o => { const bal = balance(o), earlier = accountsOf(o).length - 1;
              return <GoRow key={o.id} href={ownerHref(o)} className="click"><td><div className="cell-main apt-t">{o.apt}</div><div className="cell-sub">Block {o.block} · {o.type}{o.plan && o.plan !== 'monthly' ? ` · ${PLAN_LABEL[o.plan].toLowerCase()}` : ''}</div></td>
                <td><div>{o.name}{o.director ? <> <span className="tag">Director</span></> : null}</div><div className="cell-sub">{ownerSince(o)}{earlier ? ` · ${earlier} earlier owner${earlier > 1 ? 's' : ''}` : ''}</div></td>
                <td className="r num">{bal < 0 ? <span className="neg">{rs(-bal)} credit</span> : bal > 0 ? rs(bal) : <span className="muted">–</span>}{o.feeDue > 0 && o.status === 'active' ? <div className="cell-sub">incl. {rs(o.feeDue)} fine</div> : null}</td><td>{pill(ownerStatus(o))}</td></GoRow>; })}
          </tbody></table></div>}
      </div></div>
    </>;
  });
}
