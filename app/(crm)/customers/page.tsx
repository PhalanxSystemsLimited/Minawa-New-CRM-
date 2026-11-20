// Customers (21 Nov 2026): every customer in the person's buildings, active ones by default, or past ones (who left
// or sold), with their customer ID, CNIC, flat and balance. Clicking one opens all their details and history.
// Every role: the Admin and the Accountant see their buildings, a building manager his.
import { requireStaff, roleName } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { use, balance, ownerStatus } from '@/lib/engine';
import { custId, cnicState, cnicNote } from '@/lib/people';
import { Go, GoRow } from '@/components/client';
import { RowCheck, AllCheck, SelBar } from '@/components/Selection';
import { MoreBar, shownOf } from '@/components/views/more';
import { fd, fds, rs, todayPKT } from '@/lib/fmt';
import { PageIc, KIc, Empty } from '@/components/views/art';
import { Ic } from '@/components/icons';
import type { Owner } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Row { o: Owner; pid: string; pname: string; id: string; bal: number; status: string }

export default async function Customers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, me = await requireStaff(), today = todayPKT();
  const all = await liveProjects(me), pid = all.some(p => p.id === sp.p) ? sp.p! : '';
  const past = sp.v === 'past', q = (sp.q || '').trim().toLowerCase(), digits = q.replace(/\D/g, '');
  const states = await Promise.all((pid ? all.filter(p => p.id === pid) : all).map(p => load(p.id, me)));
  const rows: Row[] = states.flatMap(s => use(s, () => s.owners.map(o => ({ o, pid: s.project, pname: s.proj.name, id: custId(o), bal: balance(o), status: ownerStatus(o) }))));
  const active = rows.filter(r => r.o.status === 'active'), gone = rows.filter(r => r.o.status === 'closed');
  const match = (r: Row) => !q || `${r.id} ${r.o.name} ${r.o.apt} ${r.o.phone} ${r.o.cnic || ''} ${r.pname}`.toLowerCase().includes(q) || (digits.length >= 4 && `${r.o.cnic || ''}${r.o.phone}`.replace(/\D/g, '').includes(digits));
  const list = (past ? gone : active).filter(match).sort((a, b) => past ? (b.o.closedOn || '').localeCompare(a.o.closedOn || '') : a.id.localeCompare(b.id, 'en', { numeric: true }));
  const shown = shownOf(sp.n, list.length), page = list.slice(0, shown);
  const noCnic = active.filter(r => !r.o.cnic).length, expired = active.filter(r => cnicState(r.o.cnicExpiry, today) === 'expired').length, soon = active.filter(r => cnicState(r.o.cnicExpiry, today) === 'soon').length;
  const href = (k: Record<string, string>) => { const u = new URLSearchParams(Object.entries({ p: pid, v: past ? 'past' : '', q: sp.q || '', ...k }).filter(([, v]) => v)).toString(); return '/customers' + (u ? '?' + u : ''); };
  const cnicTag = (o: Owner) => !o.cnic ? <span className="tag warn">CNIC not on file</span> : cnicState(o.cnicExpiry, today) === 'expired' ? <span className="tag bad">{cnicNote(o.cnicExpiry, today)}</span> : cnicState(o.cnicExpiry, today) === 'soon' ? <span className="tag warn">{cnicNote(o.cnicExpiry, today)}</span> : null;
  return <>
    <div className="proj-head"><PageIc n="users" tone="violet" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Customers</div></div><div className="crumb-path">Dashboard<span>/</span>Customers</div></div>
    <div className="kpis">
      <div className="kpi"><KIc n="users" tone="green" /><div className="l">Active customers</div><div className="v num">{active.length}</div><div className="cell-sub">{pid ? all.find(p => p.id === pid)?.name : `${states.length} building${states.length === 1 ? '' : 's'}`}</div></div>
      <div className="kpi"><KIc n="history" tone="blue" /><div className="l">Past customers</div><div className="v num">{gone.length}</div><div className="cell-sub">left or sold</div></div>
      <div className="kpi"><KIc n="card" tone="amber" /><div className="l">CNIC not on file</div><div className="v num">{noCnic}</div><div className="cell-sub">active customers · add it with Edit</div></div>
      <div className="kpi"><KIc n="alert" tone="red" /><div className="l">CNIC expired or expiring</div><div className="v num">{expired + soon}</div><div className="cell-sub">{expired} expired · {soon} within a month</div></div>
    </div>
    <div className="card">
      <div className="toolbar cus-tools">
        <div className="ptabs" role="tablist">
          <Go href={href({ v: '' })} current={!past ? 'true' : 'false'} replace>Active customers <span className="tab-new">{active.length}</span></Go>
          <Go href={href({ v: 'past' })} current={past ? 'true' : 'false'} replace>Past customers <span className="tab-new">{gone.length}</span></Go>
        </div>
        <form method="get" action="/customers" className="cus-form">
          {past ? <input type="hidden" name="v" value="past" /> : null}
          {all.length > 1 ? <select name="p" defaultValue={pid} aria-label="Building"><option value="">All buildings</option>{all.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : null}
          <input type="search" name="q" defaultValue={sp.q || ''} placeholder="Name, customer ID, CNIC, flat or phone" aria-label="Search customers" />
          <button type="submit" className="btn sm"><Ic n="search" s={15} /> Search</button>
        </form>
      </div>
      <SelBar id="cus-sel" action="/api/export/customers" params={{ p: pid, v: past ? 'past' : '', q: sp.q || '' }} allHref={`/api/export/customers?${new URLSearchParams(Object.entries({ p: pid, v: past ? 'past' : '', q: sp.q || '' }).filter(([, v]) => v))}`} noun="customer" allLabel={`Download all ${list.length}`} />
      {list.length ? <><div className="tbl-wrap"><table className="cus-tbl"><thead><tr><th className="chk"><AllCheck form="cus-sel" /></th><th>Customer ID</th><th>Customer</th><th>Flat</th>{pid ? null : <th>Building</th>}<th>Phone</th><th>Possession</th>{past ? <th>Left on</th> : null}<th className="r">{past ? 'Balance at leaving' : 'Balance'}</th></tr></thead><tbody>
        {page.map(r => <GoRow key={r.pid + r.o.id} href={`/customers/${r.pid}/${r.o.id}`} className="row-link">
          <td className="chk" data-l=""><RowCheck form="cus-sel" value={`${r.pid}|${r.o.id}`} label={`Select ${r.o.name}`} /></td>
          <td data-l="Customer ID"><b className="num">{r.id}</b></td>
          <td data-l="Customer"><b>{r.o.name}</b><div className="cell-sub num">{r.o.cnic ? `CNIC ${r.o.cnic}` : ''}</div>{cnicTag(r.o)}</td>
          <td data-l="Flat"><b>{r.o.apt}</b><div className="cell-sub">{[r.o.block && `Block ${r.o.block}`, r.o.type].filter(Boolean).join(' · ')}</div></td>
          {pid ? null : <td data-l="Building">{r.pname}</td>}
          <td data-l="Phone" className="num">{r.o.noPhone || !r.o.phone ? <span className="cell-sub">none</span> : r.o.phone}</td>
          <td data-l="Possession" style={{ whiteSpace: 'nowrap' }}>{r.o.possessionKnown ? fds(r.o.possession) : <span className="cell-sub">not on file</span>}</td>
          {past ? <td data-l="Left on" style={{ whiteSpace: 'nowrap' }}>{r.o.closedOn ? fd(r.o.closedOn) : '—'}</td> : null}
          <td data-l="Balance" className="r num">{r.bal > 0 ? <b>{rs(r.bal)}</b> : r.bal < 0 ? <span className="cell-sub">{rs(-r.bal)} advance</span> : <span className="cell-sub">Rs 0</span>}{!past && r.status === 'overdue' ? <div><span className="tag bad">Overdue</span></div> : null}</td>
        </GoRow>)}
      </tbody></table></div><MoreBar shown={shown} total={list.length} noun="customer" href={n => href({ n })} /></>
        : <Empty kind="search" small title={q ? `No ${past ? 'past' : 'active'} customer matches "${sp.q}"` : past ? 'No past customers yet' : 'No active customers'}>{past ? 'Customers who leave or sell their flat show here, with the date they left.' : null}</Empty>}
      <p className="cell-sub" style={{ margin: '10px 0 0' }}>Click a customer for their details, payments, charges and history{past ? ', and the date they left' : ''}. The Excel download has a sheet with each customer\'s whole history (up to 60 customers at a time).</p>
    </div>
  </>;
}
