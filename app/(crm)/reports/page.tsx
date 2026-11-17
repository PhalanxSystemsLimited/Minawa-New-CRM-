// Reports (17 Nov 2026): the defaulters / dues list and the monthly collection report per building, each with a CSV
// and a print view. Admin and Accountant see every building; a building manager sees his own.
import { requireStaff, roleName } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { duesList, monthReport } from '@/lib/reports';
import { PrintBtn, Go } from '@/components/client';
import { fd, fds, fm, rs, todayPKT, prevMonth } from '@/lib/fmt';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, [string, string]> = { due: ['Due', 'info'], overdue: ['Overdue', 'warn'], flagged: ['Flagged', 'bad'] };

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, me = await requireStaff(), today = todayPKT();
  const r = sp.r === 'month' ? 'month' : 'dues';
  const all = await liveProjects(me), pid = all.some(p => p.id === sp.p) ? sp.p! : '';
  const projects = pid ? all.filter(p => p.id === pid) : all;
  const states = await Promise.all(projects.map(p => load(p.id, me)));
  const month = /^\d{4}-\d{2}$/.test(sp.month || '') && sp.month! <= today.slice(0, 7) ? sp.month! : today.slice(0, 7);
  const overdue = sp.o === '1';
  const qs = (x: Record<string, string>) => '?' + new URLSearchParams(Object.entries({ r, p: pid, month, o: overdue ? '1' : '', ...x }).filter(([, v]) => v)).toString();

  const head = <>
    <div className="proj-head"><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Reports</div></div><div className="crumb-path">Dashboard<span>/</span>Reports</div></div>
    <nav className="proj-tabs no-print" aria-label="Reports">
      <Go href={qs({ r: 'dues' })} current={r === 'dues'}>Dues and defaulters</Go>
      <Go href={qs({ r: 'month' })} current={r === 'month'}>Monthly collection</Go>
    </nav>
    <form method="get" className="card no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <input type="hidden" name="r" value={r} />
      <div className="form-row" style={{ margin: 0 }}><label htmlFor="rp-p">Building</label><select id="rp-p" name="p" defaultValue={pid}><option value="">All your buildings</option>{all.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      {r === 'month' ? <div className="form-row" style={{ margin: 0 }}><label htmlFor="rp-m">Month</label><input id="rp-m" name="month" type="month" defaultValue={month} max={today.slice(0, 7)} /></div>
        : <label style={{ display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 8 }}><input type="checkbox" name="o" value="1" defaultChecked={overdue} /> Overdue only (defaulters)</label>}
      <button type="submit" className="btn">Show</button>
      <span style={{ flex: 1 }} />
      <a className="btn" href={r === 'month' ? `/api/export/collections?month=${month}${pid ? `&project=${pid}` : ''}` : `/api/export/dues?${pid ? `project=${pid}&` : ''}${overdue ? 'overdue=1' : ''}`}>Download CSV</a>
      <PrintBtn>Print</PrintBtn>
    </form>
  </>;

  if (r === 'dues') {
    const rows = duesList(states, overdue), sum = rows.reduce((a, x) => a + x.total, 0);
    return <>{head}
      <div className="rpt">
        <div className="print-only"><h2 style={{ margin: '0 0 4px' }}>{overdue ? 'Defaulters' : 'Dues list'} · {pid ? projects[0].name : 'All buildings'}</h2><p className="muted" style={{ margin: '0 0 12px' }}>As of {fd(today)}</p></div>
        <div className="kpis">
          <div className="kpi"><div className="l">Apartments owing</div><div className="v num">{rows.length}</div><div className="cell-sub">{overdue ? 'overdue or flagged' : 'with a balance'}</div></div>
          <div className="kpi"><div className="l">Total owed</div><div className="v num">{rs(sum)}</div><div className="cell-sub">arrears, bills and fines</div></div>
          <div className="kpi"><div className="l">Overdue</div><div className="v num">{rows.filter(x => x.status === 'overdue').length}</div><div className="cell-sub">past the due date</div></div>
          <div className="kpi"><div className="l">Flagged</div><div className="v num">{rows.filter(x => x.status === 'flagged').length}</div><div className="cell-sub">for disconnection</div></div>
        </div>
        <div className="card"><div className="card-row"><h3>{overdue ? 'Defaulters' : 'Who owes'} <small>{rows.length} apartment{rows.length === 1 ? '' : 's'} · worst first</small></h3></div>
          {rows.length ? <div className="tbl-wrap"><table className="rpt-tbl"><thead><tr><th>Apartment</th><th>Owner</th>{pid ? null : <th>Building</th>}<th className="r">Earlier dues</th><th className="r">Unpaid bills</th><th className="r">Fine</th>{rows.some(x => x.other) ? <th className="r">Other</th> : null}<th className="r">Total</th><th>Oldest due</th><th>Status</th></tr></thead><tbody>
            {rows.map(x => <tr key={x.project + x.ownerId}>
              <td data-l="Apartment"><Go href={`/p/${x.project}/apartments/${x.ownerId}`} className="link-btn"><b>{x.apt}</b></Go></td>
              <td data-l="Owner">{x.name}<div className="cell-sub">{x.phone || 'no number'}</div></td>
              {pid ? null : <td data-l="Building">{x.pname}</td>}
              <td data-l="Earlier dues" className="r num">{x.arrears ? rs(x.arrears) : '—'}</td>
              <td data-l="Unpaid bills" className="r num">{x.bills ? rs(x.bills) : '—'}{x.nBills ? <div className="cell-sub">{x.nBills} bill{x.nBills === 1 ? '' : 's'}</div> : null}</td>
              <td data-l="Fine" className="r num">{x.fine ? rs(x.fine) : '—'}</td>
              {rows.some(y => y.other) ? <td data-l="Other" className="r num">{x.other ? rs(x.other) : '—'}</td> : null}
              <td data-l="Total" className="r num"><b>{rs(x.total)}</b></td>
              <td data-l="Oldest due" style={{ whiteSpace: 'nowrap' }}>{x.oldestDue ? fds(x.oldestDue) : '—'}{x.daysOver ? <div className="cell-sub">{x.daysOver} day{x.daysOver === 1 ? '' : 's'} late</div> : null}</td>
              <td data-l="Status">{STATUS[x.status] ? <span className={`tag ${STATUS[x.status][1]}`}>{STATUS[x.status][0]}</span> : x.status}{x.promise ? <div className="cell-sub">promised by {fds(x.promise)}</div> : null}</td>
            </tr>)}
          </tbody></table></div> : <p className="empty">Nobody owes anything{overdue ? ' past the due date' : ''}.</p>}
        </div>
      </div>
    </>;
  }

  const reps = states.map(s => monthReport(s, month));
  const tot = { billed: reps.reduce((a, x) => a + x.billed, 0), collected: reps.reduce((a, x) => a + x.collected, 0), n: reps.reduce((a, x) => a + x.nPays, 0), out: reps.reduce((a, x) => a + x.outstanding, 0) };
  return <>{head}
    <div className="rpt">
      <div className="print-only"><h2 style={{ margin: '0 0 4px' }}>Monthly collection · {fm(month)}</h2><p className="muted" style={{ margin: '0 0 12px' }}>{pid ? projects[0].name : 'All buildings'} · printed {fd(today)}</p></div>
      <div className="kpis">
        <div className="kpi"><div className="l">Billed in {fm(month)}</div><div className="v num">{rs(tot.billed)}</div><div className="cell-sub">bills issued that month</div></div>
        <div className="kpi"><div className="l">Collected</div><div className="v num">{rs(tot.collected)}</div><div className="cell-sub">{tot.n} cash payment{tot.n === 1 ? '' : 's'}{tot.billed ? ` · ${Math.round(tot.collected / tot.billed * 100)}% of billed` : ''}</div></div>
        <div className="kpi"><div className="l">Still owed today</div><div className="v num">{rs(tot.out)}</div><div className="cell-sub">all apartments</div></div>
      </div>
      <p className="no-print cell-sub" style={{ margin: '0 0 4px' }}><Go href={qs({ month: prevMonth(month) })} className="link-btn">← {fm(prevMonth(month))}</Go></p>
      {reps.length > 1 ? <div className="card"><div className="card-row"><h3>By building</h3></div><div className="tbl-wrap"><table><thead><tr><th>Building</th><th className="r">Billed</th><th className="r">Collected</th><th className="r">Payments</th><th className="r">Collected / billed</th><th className="r">Still owed today</th><th>Apartments owing</th></tr></thead><tbody>
        {reps.map(x => <tr key={x.project}><td><b>{x.pname}</b></td><td className="r num">{rs(x.billed)}</td><td className="r num">{rs(x.collected)}</td><td className="r">{x.nPays}</td><td className="r">{x.billed ? `${Math.round(x.collected / x.billed * 100)}%` : '—'}</td><td className="r num">{rs(x.outstanding)}</td><td>{x.owing} of {x.aptCount}</td></tr>)}
        <tr><td><b>Total</b></td><td className="r num"><b>{rs(tot.billed)}</b></td><td className="r num"><b>{rs(tot.collected)}</b></td><td className="r">{tot.n}</td><td className="r">{tot.billed ? `${Math.round(tot.collected / tot.billed * 100)}%` : '—'}</td><td className="r num"><b>{rs(tot.out)}</b></td><td></td></tr>
      </tbody></table></div></div> : null}
      {reps.map(x => <div className="card" key={x.project}><div className="card-row"><h3>{x.pname} <small>{fm(month)} · {rs(x.collected)} collected of {rs(x.billed)} billed ({x.nBills} bill{x.nBills === 1 ? '' : 's'})</small></h3></div>
        <div className="grid2">
          <div><b>By who took the cash</b>{x.byCollector.length ? <div className="tbl-wrap"><table><thead><tr><th>Name</th><th className="r">Payments</th><th className="r">Amount</th></tr></thead><tbody>
            {x.byCollector.map(c => <tr key={c.name}><td>{c.name}</td><td className="r">{c.n}</td><td className="r num">{rs(c.amount)}</td></tr>)}</tbody></table></div> : <p className="empty">No payments this month.</p>}</div>
          <div><b>By day</b>{x.byDay.length ? <div className="tbl-wrap"><table><thead><tr><th>Day</th><th className="r">Payments</th><th className="r">Amount</th></tr></thead><tbody>
            {x.byDay.map(d => <tr key={d.d}><td>{fds(d.d)}</td><td className="r">{d.n}</td><td className="r num">{rs(d.amount)}</td></tr>)}</tbody></table></div> : <p className="empty">—</p>}</div>
        </div>
        <p className="cell-sub" style={{ marginTop: 8 }}>Today: {x.paidUp} of {x.aptCount} apartments paid up; {x.owing} owe {rs(x.outstanding)} in total.</p>
      </div>)}
    </div>
  </>;
}
