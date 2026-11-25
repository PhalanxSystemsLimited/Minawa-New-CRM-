// Statements (26 Nov 2026): closing statements for the accountant (and the Admin). Pick a building and a period
// (this month, last month, this year, last year or any dates); download the building's closing statement (PDF and
// Excel), or any customer's statement of account (PDF). Worked out from the account entries at the moment of
// download, so they are always up to date.
import { requireRole, roleName } from '@/lib/session';
import { liveProjects, load } from '@/lib/ops';
import { use } from '@/lib/engine';
import { closingRows } from '@/lib/statements';
import { Go } from '@/components/client';
import { PageIc, Empty } from '@/components/views/art';
import { Ic } from '@/components/icons';
import { shownOf, MoreBar } from '@/components/views/more';
import { rs, fd, todayPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const okD = (x?: string) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

export default async function Statements({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const me = await requireRole('accountant', 'admin');
  const projs = await liveProjects(me);
  if (!projs.length) return <Empty card kind="inbox" title="No building yet">Statements show here once you have a building.</Empty>;
  const pid = projs.some(p => p.id === sp.b) ? sp.b : projs[0].id, today = todayPKT(), y = +today.slice(0, 4), m = +today.slice(5, 7);
  const presets: [string, string, string, string][] = [
    ['month', 'This month', `${today.slice(0, 7)}-01`, today],
    ['last', 'Last month', `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}-01`, lastDay(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1)],
    ['year', 'This year', `${y}-01-01`, today],
    ['lastyear', 'Last year', `${y - 1}-01-01`, `${y - 1}-12-31`],
  ];
  const pre = presets.find(x => x[0] === sp.p);
  const from0 = okD(sp.from) ? sp.from : pre ? pre[2] : presets[2][2], to = okD(sp.to) ? sp.to : pre ? pre[3] : presets[2][3], from = from0 > to ? to : from0;
  const which = !okD(sp.from) && !okD(sp.to) ? (pre ? pre[0] : 'year') : '';
  const s = await load(pid, me), q = String(sp.q || '').trim().toLowerCase();
  const rows = use(s, () => closingRows(from, to)).filter(r => !q || r.o.apt.toLowerCase().includes(q) || r.o.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  const tot = (k: 'opening' | 'charges' | 'fines' | 'credits' | 'paid' | 'closing') => rows.reduce((a, r) => a + r[k], 0);
  const n = shownOf(sp.n, rows.length), per = `from=${from}&to=${to}`;
  const href = (k: Record<string, string>) => '/statements?' + new URLSearchParams(Object.entries({ b: pid, p: which, from: which ? '' : from, to: which ? '' : to, q: sp.q || '', ...k }).filter(([, x]) => x)).toString();
  const money = (v: number) => v < 0 ? `${rs(-v)} cr` : rs(v);
  return <>
    <div className="proj-head"><PageIc n="file" tone="blue" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Statements</div></div><div className="crumb-path">Dashboard<span>/</span>Statements</div></div>
    <div className="card">
      <div className="card-row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div>
          {projs.length > 1 ? <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>{projs.map(p => <a key={p.id} href={href({ b: p.id, n: '' })} className={'chipbtn' + (pid === p.id ? ' on' : '')}>{p.name}</a>)}</div> : null}
          <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{presets.map(([k, l]) => <a key={k} href={`/statements?${new URLSearchParams({ b: pid, p: k })}`} className={'chipbtn' + (which === k ? ' on' : '')}>{l}</a>)}</div>
        </div>
        <form action="/statements" className="st-dates"><input type="hidden" name="b" value={pid} />
          <label>From <input type="date" name="from" defaultValue={from} max={today} required /></label>
          <label>To <input type="date" name="to" defaultValue={to} max={today} required /></label>
          <button type="submit" className="btn sm">Show</button></form>
      </div>
      <div className="st-head">
        <div><b>{s.proj.name} · closing statement</b><small>{fd(from)} – {fd(to)} · {rows.length} customer{rows.length === 1 ? '' : 's'}</small></div>
        <div className="st-dl">
          <a className="btn sm primary" href={`/api/pdf/${pid}/closing/all?${per}`} target="_blank" rel="noopener"><Ic n="file" s={15} /> PDF</a>
          <a className="btn sm" href={`/api/export/closing?project=${pid}&${per}`}><Ic n="download" s={15} /> Excel</a>
          {projs.length > 1 ? <a className="btn sm" href={`/api/export/closing?${per}`}><Ic n="download" s={15} /> Excel, all buildings</a> : null}
        </div>
      </div>
      <div className="st-sum">
        <div><small>Owed at the start</small><b className="num">{money(tot('opening'))}</b></div>
        <div><small>Charged</small><b className="num">{rs(tot('charges'))}</b></div>
        <div><small>Fines</small><b className="num">{rs(tot('fines'))}</b></div>
        <div><small>Discounts &amp; credits</small><b className="num">{rs(tot('credits'))}</b></div>
        <div className="good"><small>Paid</small><b className="num">{rs(tot('paid'))}</b></div>
        <div className="bad"><small>Owed at the end</small><b className="num">{money(tot('closing'))}</b></div>
      </div>
      <form action="/statements" className="cq-search" role="search" style={{ margin: '12px 0' }}><input type="hidden" name="b" value={pid} />{which ? <input type="hidden" name="p" value={which} /> : <><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /></>}
        <Ic n="search" s={16} /><input name="q" type="search" defaultValue={sp.q || ''} placeholder="Search flat, name or customer ID" aria-label="Search" /></form>
      {rows.length ? <><div className="tbl-wrap"><table className="cq-tbl st-tbl"><thead><tr><th>Flat</th><th>Customer</th><th className="r">Opening</th><th className="r">Charged</th><th className="r">Fines</th><th className="r">Credits</th><th className="r">Paid</th><th className="r">Closing</th><th></th></tr></thead><tbody>
        {rows.slice(0, n).map(r => <tr key={r.o.id}>
          <td data-l="Flat"><b>{r.o.apt}</b></td>
          <td data-l="Customer">{r.o.name}{r.o.status === 'closed' ? <span className="tag"> left</span> : null}<div className="cell-sub">{r.id}{r.years ? ` · ${r.years}` : ''}</div></td>
          <td data-l="Opening" className="r num">{money(r.opening)}</td><td data-l="Charged" className="r num">{rs(r.charges)}</td><td data-l="Fines" className="r num">{rs(r.fines)}</td>
          <td data-l="Credits" className="r num">{rs(r.credits)}</td><td data-l="Paid" className="r num">{rs(r.paid)}</td><td data-l="Closing" className="r num"><b>{money(r.closing)}</b></td>
          <td className="r"><a className="btn sm" href={`/api/pdf/${pid}/account/${encodeURIComponent(r.o.id)}?${per}`} target="_blank" rel="noopener"><Ic n="file" s={14} /> PDF</a></td>
        </tr>)}
      </tbody></table></div><MoreBar shown={n} total={rows.length} noun="customer" href={k => href({ n: k })} /></>
        : <Empty kind="inbox" small title="No customers here">Nobody matches the search.</Empty>}
      <p className="cell-sub" style={{ margin: '10px 0 0' }}>Each statement is worked out when you download it, so it always matches the balances on every screen. Opening and closing are the balance at the start and the end of the period (&quot;cr&quot; is advance credit). What is left unpaid at the end of a year carries into the next year, and the customer&apos;s statement lists it by year.</p>
    </div>
    <p className="cell-sub"><Go href="/collect">Collect payments</Go> · <Go href="/tasks">To do</Go></p>
  </>;
}
