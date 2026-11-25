// Collect payments (26 Nov 2026): the accountant's list of customers with dues, in his buildings, most owed first.
// For each he sends a payment request to a building manager: the amount to collect, cash or bank transfer, the months
// it is for and a note. The building manager sees only his requests and answers each with an entry; the accountant
// approves it in To do, and the receipt (with the months) then waits in To do › Receipts to send. ?v=requests lists
// the requests and where each stands.
import { requireRole, roleName } from '@/lib/session';
import { getStore } from '@/lib/store';
import { liveProjects, load } from '@/lib/ops';
import { use, balance, billsOf, unpaid, isUtilBill } from '@/lib/engine';
import { custId, accountantsOf } from '@/lib/people';
import { createRequestAction, cancelRequestAction } from '@/lib/actions-requests';
import { yearDues, yearsText, paidMonths } from '@/lib/requests';
import { Go, Submit, ModalShell } from '@/components/client';
import { PageIc, Empty } from '@/components/views/art';
import { Ic } from '@/components/icons';
import { shownOf, MoreBar } from '@/components/views/more';
import { rs, fds, fm, todayPKT, periodText } from '@/lib/fmt';
import type { Owner, PayRequest, Proof } from '@/lib/types';

export const dynamic = 'force-dynamic';

const addMonths = (p: string, n: number) => new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);

export default async function Collect({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const me = await requireRole('accountant', 'admin'), staff = await (await getStore()).listStaff();
  const projs = await liveProjects(me), states = await Promise.all(projs.map(p => load(p.id, me)));
  const v = sp.v === 'requests' ? 'requests' : '', b = projs.some(p => p.id === sp.b) ? sp.b : '', q = String(sp.q || '').trim().toLowerCase().slice(0, 60), today = todayPKT();
  const shown = b ? states.filter(s => s.project === b) : states;
  const href = (k: Record<string, string>) => '/collect?' + new URLSearchParams(Object.entries({ v, b, q: sp.q || '', ...k }).filter(([, x]) => x)).toString();
  const back = href({});
  // Customers with dues, most owed first, with any open request.
  const dues = shown.flatMap(s => use(s, () => s.owners.filter(o => o.status === 'active' && !o.exempt && balance(o) > 0)
    .filter(o => !q || o.apt.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || custId(o).toLowerCase().includes(q))
    .map(o => { const open = billsOf(o).filter(x => unpaid(x) > 0); return { o, s, bal: balance(o), bills: open.length, oldest: open[0]?.dueDate || null, req: (s.requests || []).find(r => r.ownerId === o.id && r.status === 'open') || null, cid: custId(o), years: yearsText(o) }; })))
    .sort((a, b2) => b2.bal - a.bal);
  const reqs = shown.flatMap(s => use(s, () => (s.requests || []).map(r => { const o = s.owners.find(x => x.id === r.ownerId); return { r, s, apt: o?.apt || '', name: o?.name || '', pr: r.proofId ? s.proofs.find(x => x.id === r.proofId) || null : null }; })))
    .sort((a, b2) => `${b2.r.d} ${b2.r.t}`.localeCompare(`${a.r.d} ${a.r.t}`));
  const st = ['open', 'entered', 'done', 'cancelled'].includes(sp.st) ? sp.st : '';
  const stateOf = (r: PayRequest, pr: Proof | null) => r.status === 'cancelled' ? 'cancelled' : r.status === 'open' ? 'open' : pr?.status === 'verified' ? 'done' : 'entered';
  const reqList = reqs.filter(x => !st || stateOf(x.r, x.pr) === st);
  const nOpen = reqs.filter(x => x.r.status === 'open').length, nEntered = reqs.filter(x => stateOf(x.r, x.pr) === 'entered').length;
  const n = shownOf(sp.n, v ? reqList.length : dues.length);

  // The request form for one customer.
  let modal: React.ReactNode = null;
  if (sp.req) {
    const [pid, oid] = sp.req.split(':'), s = states.find(x => x.project === pid);
    const f = s ? use(s, () => {
      const o = s.owners.find(x => x.id === oid) as Owner | undefined; if (!o) return null;
      const bills = billsOf(o), span = (l: typeof bills) => { const u = l.filter(x => unpaid(x) > 0); return u.length ? [u.map(x => x.period).sort()[0], u.map(x => x.periodEnd || x.period).sort().pop()!] : [today.slice(0, 7), today.slice(0, 7)]; };
      const pm = span(bills.filter(x => !isUtilBill(x))), first = [pm[0], addMonths(today.slice(0, 7), -12)].sort()[0], months: string[] = [];
      for (let m = first; m <= addMonths(today.slice(0, 7), 12); m = addMonths(m, 1)) months.push(m);
      const elec = s.settings.rules.utilities.includes('Electricity') && bills.some(x => isUtilBill(x));
      return { o, cid: custId(o), bal: balance(o), pm, months, elec, years: yearDues(o), paid: paidMonths(o), open: (s.requests || []).find(r => r.ownerId === o.id && r.status === 'open') };
    }) : null;
    const mgrs = staff.filter(x => x.role === 'manager' && x.active && !x.leftOn && (x.projects || []).includes(pid))
      .sort((a, c) => +accountantsOf(c).includes(me.id) - +accountantsOf(a).includes(me.id) || a.name.localeCompare(c.name));
    modal = !f || !s ? <ModalShell title="Payment request" closeKeys={['req', 't']}><div className="callout">This customer was not found.</div></ModalShell>
      : <ModalShell title={`Payment request · ${f.o.apt}`} closeKeys={['req', 't']} wide>
        {f.open ? <div className="callout warn"><div>{f.o.apt} already has an open request ({f.open.id}, {rs(f.open.amount)} with {f.open.managerName}). Cancel it on Requests to ask again.</div></div> :
        <form action={createRequestAction} className="rules-form cq-form">
          <input type="hidden" name="pid" value={pid} /><input type="hidden" name="oid" value={f.o.id} /><input type="hidden" name="back" value={back} />
          {sp.t ? <div className="callout bad" role="alert"><div>{sp.t}</div></div> : null}
          <div className="cq-who"><span className="cq-apt">{f.o.apt}</span><div><b>{f.o.name}</b><small>{f.cid} · {s.proj.name} · owes <b>{rs(f.bal)}</b></small>
            {f.years.length ? <div className="cq-years">{f.years.map(y => <span key={y.label}>{y.label}: <b>{rs(y.amount)}</b></span>)}</div> : null}</div></div>
          <div className="grid2" style={{ gap: 10 }}>
            <div className="form-row"><label htmlFor="cq-a">Amount to collect (Rs)</label><input id="cq-a" name="amount" type="number" min={1} step={1} required defaultValue={f.bal} /></div>
            <div className="form-row"><label htmlFor="cq-m">Building manager who collects it</label>
              {mgrs.length ? <select id="cq-m" name="manager" required defaultValue={mgrs[0].id}>{mgrs.map(x => <option key={x.id} value={x.id}>{x.name}{accountantsOf(x).includes(me.id) ? '' : ' (not one of yours)'}</option>)}</select>
                : <div className="callout warn"><div>No building manager is assigned to {s.proj.name}. The Admin assigns one on Staff &amp; connections.</div></div>}</div>
          </div>
          <fieldset className="pay-via"><legend>How the customer pays</legend>
            <label className="pay-via-o"><input type="radio" name="method" value="Cash" defaultChecked /> <span><b>Cash</b><small>he collects it and writes a receipt from his cash book</small></span></label>
            <label className="pay-via-o"><input type="radio" name="method" value="Bank transfer" /> <span><b>Bank transfer</b><small>he takes the transaction ID and a photo of the transfer</small></span></label>
          </fieldset>
          {f.elec ? <fieldset className="pay-via"><legend>Payment for</legend>
            <label className="pay-via-o"><input type="radio" name="forWhat" value="maintenance" defaultChecked /> <span><b>Maintenance</b><small>bills and earlier dues</small></span></label>
            <label className="pay-via-o"><input type="radio" name="forWhat" value="electricity" /> <span><b>Electricity</b><small>pays the electricity bills first</small></span></label>
          </fieldset> : null}
          <div className="grid2" style={{ gap: 10 }}>
            <div className="form-row"><label htmlFor="cq-f">Paid for: from</label><select id="cq-f" name="periodFrom" defaultValue={f.pm[0]} required>{f.months.map(m => <option key={m} value={m}>{fm(m)}{f.paid.has(m) ? ' · paid' : ''}</option>)}</select></div>
            <div className="form-row"><label htmlFor="cq-t">to</label><select id="cq-t" name="periodTo" defaultValue={f.pm[1]} required>{f.months.map(m => <option key={m} value={m}>{fm(m)}{f.paid.has(m) ? ' · paid' : ''}</option>)}</select></div>
          </div>
          <p className="cell-sub" style={{ margin: '-4px 0 0' }}>The months are shown on the customer&apos;s receipt and its WhatsApp message, and the payment pays those months first. Months marked paid are paid in full: a request can only ask for what is still unpaid for its months (or for months not billed yet, as an advance).</p>
          <div className="form-row"><label htmlFor="cq-n">Note for the building manager (optional)</label><input id="cq-n" name="note" type="text" maxLength={300} placeholder="e.g. He said he will pay on Friday evening" /></div>
          <div className="m-actions"><Go href={back} className="btn">Cancel</Go><Submit disabled={!mgrs.length}>Send request</Submit></div>
        </form>}
      </ModalShell>;
  }

  const tag = (r: PayRequest, pr: Proof | null) => { const k = stateOf(r, pr);
    return k === 'open' ? <span className="tag info">{r.reply ? 'Came back · open' : 'Open'} · {r.managerName}</span> : k === 'entered' ? <span className="tag warn">Entered · approve it</span> : k === 'done' ? <span className="tag good">Approved</span> : <span className="tag">Cancelled</span>; };
  return <>
    <div className="proj-head"><PageIc n="wallet" tone="green" /><div><div className="eyebrow-b">{roleName(me)}</div><div className="proj-title">Collect payments</div></div><div className="crumb-path">Dashboard<span>/</span>Collect payments</div></div>
    <nav className="proj-tabs" aria-label="Collect payments">
      <Go href={href({ v: '', n: '', st: '' })} current={!v}>Customers with dues <span className="tab-new">{dues.length}</span></Go>
      <Go href={href({ v: 'requests', n: '', st: '' })} current={v === 'requests'}>Requests {nOpen ? <span className="tab-new" title="Open">{nOpen}</span> : null}{nEntered ? <> <span className="tab-b" title="Entered, to approve">{nEntered}</span></> : null}</Go>
    </nav>
    <div className="card">
      <div className="card-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <form action="/collect" className="cq-search" role="search">{v ? <input type="hidden" name="v" value={v} /> : null}{b ? <input type="hidden" name="b" value={b} /> : null}
          <Ic n="search" s={16} /><input name="q" type="search" defaultValue={sp.q || ''} placeholder="Search flat, name or customer ID" aria-label="Search" /></form>
        {projs.length > 1 ? <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <a href={href({ b: '', n: '' })} className={'chipbtn' + (!b ? ' on' : '')}>All buildings</a>
          {projs.map(p => <a key={p.id} href={href({ b: p.id, n: '' })} className={'chipbtn' + (b === p.id ? ' on' : '')}>{p.name}</a>)}</div> : null}
      </div>
      {!v ? (dues.length ? <>
        <div className="tbl-wrap"><table className="cq-tbl"><thead><tr><th>Flat</th><th>Customer</th>{projs.length > 1 && !b ? <th>Building</th> : null}<th className="r">Owes</th><th>Unpaid bills</th><th>Request</th><th></th></tr></thead><tbody>
          {dues.slice(0, n).map(({ o, s, bal, bills, oldest, req, cid, years }) => <tr key={s.project + o.id}>
            <td data-l="Flat"><b>{o.apt}</b></td>
            <td data-l="Customer">{o.name}<div className="cell-sub">{cid}{o.phone ? ` · ${o.phone}` : ' · no WhatsApp'}</div></td>
            {projs.length > 1 && !b ? <td data-l="Building">{s.proj.name}</td> : null}
            <td data-l="Owes" className="r num"><b>{rs(bal)}</b>{years ? <div className="cell-sub">{years}</div> : null}</td>
            <td data-l="Unpaid bills">{bills ? <>{bills} bill{bills === 1 ? '' : 's'}{oldest ? <div className="cell-sub">{oldest < today ? 'overdue since' : 'due'} {fds(oldest)}</div> : null}</> : <span className="cell-sub">old dues</span>}</td>
            <td data-l="Request">{req ? <span className="tag info">{rs(req.amount)} · {req.managerName}</span> : <span className="cell-sub">none</span>}</td>
            <td className="r"><a className="btn sm ghost" href={`/api/pdf/${s.project}/account/${encodeURIComponent(o.id)}?from=${today.slice(0, 4)}-01-01&to=${today}`} target="_blank" rel="noopener" title="Statement of account, this year"><Ic n="file" s={14} /></a> {req ? <Go href={href({ v: 'requests', st: 'open', n: '' })} className="btn sm">See request</Go> : <Go href={href({ req: `${s.project}:${o.id}` })} className="btn sm primary"><Ic n="send" s={14} /> Request collection</Go>}</td>
          </tr>)}
        </tbody></table></div>
        <MoreBar shown={n} total={dues.length} noun="customer" href={k => href({ n: k })} /></>
        : <Empty kind="done" small title={q ? 'Nobody matches the search' : 'Nobody owes anything'}>Customers with dues in your buildings show here.</Empty>)
      : <>
        <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 10px' }}>
          {([['', 'All'], ['open', 'Open'], ['entered', 'Entered, to approve'], ['done', 'Approved'], ['cancelled', 'Cancelled']] as const).map(([k, l]) => <a key={k} href={href({ st: k, n: '' })} className={'chipbtn' + (st === k ? ' on' : '')}>{l}</a>)}
        </div>
        {reqList.length ? <div className="tbl-wrap"><table className="cq-tbl"><thead><tr><th>Request</th><th>Customer</th><th className="r">Amount</th><th>For</th><th>Building manager</th><th>Status</th><th></th></tr></thead><tbody>
          {reqList.slice(0, n).map(({ r, s, apt, name, pr }) => <tr key={s.project + r.id}>
            <td data-l="Request"><b>{r.id}</b><div className="cell-sub">{fds(r.d)} · by {r.byName}</div></td>
            <td data-l="Customer"><b>{apt}</b> {name}<div className="cell-sub">{s.proj.name}</div></td>
            <td data-l="Amount" className="r num"><b>{rs(r.amount)}</b><div className="cell-sub">{r.method === 'Cash' ? 'cash' : 'bank transfer'}{pr && pr.amount !== r.amount ? ` · got ${rs(pr.amount)}` : ''}</div></td>
            <td data-l="For">{periodText(r.periodFrom, r.periodTo)}{r.forWhat === 'electricity' ? <div className="cell-sub">electricity</div> : null}</td>
            <td data-l="Building manager">{r.managerName}{pr?.ref ? <div className="cell-sub">cash book {pr.ref}</div> : pr?.txn ? <div className="cell-sub">TXN {pr.txn}</div> : null}</td>
            <td data-l="Status">{tag(r, pr)}{r.reply ? <div className="cell-sub">{r.reply}</div> : null}</td>
            <td className="r">{r.status === 'open' ? <form action={cancelRequestAction}><input type="hidden" name="pid" value={s.project} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={href({})} /><Submit className="btn sm">Cancel</Submit></form>
              : stateOf(r, pr) === 'entered' && pr ? <Go href={`/tasks#proof-${pr.id}`} className="btn sm primary">Approve</Go> : null}</td>
          </tr>)}
        </tbody></table></div> : <Empty kind="inbox" small title="No requests here">Requests you send show here with where each one stands.</Empty>}
        <MoreBar shown={n} total={reqList.length} noun="request" href={k => href({ n: k })} />
      </>}
      <p className="cell-sub" style={{ margin: '10px 0 0' }}>The building manager sees only the requests sent to him. He collects the payment, gives the customer a receipt from his cash book and enters it; it counts for the customer at once. Approve it in To do when the money reaches you: the receipt, with the months it pays for, then waits in To do › Receipts to send.</p>
    </div>
    {modal}
  </>;
}
