// Electricity bills (Oakwood, 21 Nov 2026): who has paid their electricity bill and who hasn't. When a customer says
// he paid, the building manager opens his bill under "Not paid", presses "Bill received", adds a photo of the bill
// receipt or the phone screen, and saves: the bill moves to "Paid" (the Accountant then confirms the money). The
// building manager also adds the photo of each bill here; it is printed on the bill PDF the customer gets on WhatsApp.
// Every role can look; only the building manager acts. The customer's balance includes maintenance and electricity.
import { cur, ownerById, balance, elecDue, isUtilBill, utilKind, awaitingApproval } from '@/lib/engine';
import type { Bill, Payment } from '@/lib/types';
import { rs, fd, fds, fm } from '@/lib/fmt';
import { Go, GoSelect, Submit } from '@/components/client';
import { PhotoField } from '@/components/PhotoField';
import { Ic } from '@/components/icons';
import { Empty, KIc } from '@/components/views/art';
import { projectPage, projHead } from '@/components/views/project';
import { ownerHref } from '@/components/views/bits';
import { elecReminderAction } from '@/lib/actions-photos';
import { photoStore } from '@/lib/images';

export const dynamic = 'force-dynamic';

export default async function Electricity({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), mgr = S.role === 'manager', photos = !!photoStore(), base = `/p/${pid}/electricity`;
    if (!S.settings.rules.utilities.includes('Electricity')) return <>{projHead('electricity')}<Empty card kind="done" title="No electricity bills here">Electricity is billed only where it is switched on in Settings (Oakwood).</Empty></>;
    const all = S.bills.filter(b => isUtilBill(b) && ownerById(b.ownerId)).sort((a, b) => b.period.localeCompare(a.period) || ownerById(a.ownerId).apt.localeCompare(ownerById(b.ownerId).apt, 'en', { numeric: true }));
    const months = [...new Set(all.map(b => b.period))].sort().reverse();
    const month = months.includes(sp.period) ? sp.period : '';
    const q = (sp.q || '').trim().toLowerCase();
    const list = all.filter(b => (!month || b.period === month) && (!q || (() => { const o = ownerById(b.ownerId); return `${o.apt} ${o.name} ${o.phone}`.toLowerCase().includes(q); })()));
    const left = (b: Bill) => Math.max(0, b.net - b.paid);
    const notPaid = list.filter(b => left(b) > 0), paid = list.filter(b => left(b) <= 0);
    const view = sp.v === 'paid' ? 'paid' : 'unpaid';
    const paysFor = (b: Bill): Payment[] => S.payments.filter(p => !p.reversed && p.applied.some(a => a.ref === b.id)).sort((x, y) => (y.d + y.t).localeCompare(x.d + x.t));
    const waiting = (b: Bill) => S.messages.some(m => m.status === 'pending' && m.tpl === 'elec' && m.pdf?.id === b.id);
    const href = (k: Record<string, string>) => base + '?' + new URLSearchParams(Object.entries({ period: month, q: sp.q || '', v: view, ...k }).filter(([, x]) => x)).toString();
    const sum = (l: Bill[], f: (b: Bill) => number) => l.reduce((a, b) => a + f(b), 0);
    const late = notPaid.filter(b => b.dueDate < S.today);
    const photo = (b: Bill) => mgr && photos
      ? <PhotoField pid={pid} kind="bill" owner={b.ownerId} attach={{ billId: b.id }} current={b.photoId || null} label="Photo of the bill" small />
      : b.photoId ? <a className="ph-thumb" href={`/api/img/${b.photoId}`} target="_blank" rel="noopener" title="Photo of the bill"><img src={`/api/img/${b.photoId}`} alt="Photo of the bill" /></a> : <span className="cell-sub">No photo</span>;
    return <>
      {projHead('electricity')}
      <div className="page-head"><div><h2>Electricity bills</h2><p>Who has paid their electricity bill and who hasn&apos;t. {mgr ? <>When a customer says he paid, find him under <b>Not paid</b>, press <b>Bill received</b> and add a photo of the bill receipt or his phone screen. Add the photo of each bill too: it is printed on the bill the customer gets on WhatsApp.</> : 'The building manager marks bills received (with a photo) and adds the bill photos.'} Customers&apos; balances include maintenance and electricity; electricity reminders are sent on their own.</p></div>
        {mgr ? <Go href={`/p/${pid}/utilities`} className="btn"><Ic n="bolt" s={16} /> Enter meter readings</Go> : null}</div>
      <div className="kpis">
        <div className="kpi"><KIc n="alert" tone="amber" /><div className="l">Not paid</div><div className="v num">{notPaid.length}</div><div className="cell-sub">{rs(sum(notPaid, left))} to collect</div></div>
        <div className="kpi"><KIc n="clock" tone="red" /><div className="l">Past the due date</div><div className="v num">{late.length}</div><div className="cell-sub">{rs(sum(late, left))}</div></div>
        <div className="kpi"><KIc n="okc" tone="green" /><div className="l">Paid</div><div className="v num">{paid.length}</div><div className="cell-sub">{rs(sum(list, b => b.paid))} collected</div></div>
        <div className="kpi"><KIc n="camera" tone="blue" /><div className="l">Bill photos</div><div className="v num">{list.filter(b => b.photoId).length} / {list.length}</div><div className="cell-sub">printed on the bills</div></div>
      </div>
      <div className="card">
        <div className="toolbar el-tools">
          <div className="ptabs" role="tablist">
            <Go href={href({ v: 'unpaid' })} current={view === 'unpaid' ? 'true' : 'false'} replace>Not paid <span className="tab-b">{notPaid.length}</span></Go>
            <Go href={href({ v: 'paid' })} current={view === 'paid' ? 'true' : 'false'} replace>Paid <span className="tab-new">{paid.length}</span></Go>
          </div>
          <GoSelect name="period" value={month} ariaLabel="Month" style={{ width: 'auto' }} options={[['', 'All months'], ...months.map(m => [m, fm(m)] as [string, string])]} />
          <form action={base} className="el-search"><input type="hidden" name="v" value={view} />{month ? <input type="hidden" name="period" value={month} /> : null}
            <input type="search" name="q" defaultValue={sp.q || ''} placeholder="Apartment, name or number" aria-label="Search" /></form>
        </div>
        {view === 'unpaid' ? (notPaid.length ? <>
          {mgr ? <form action={elecReminderAction} className="el-bulk"><input type="hidden" name="pid" value={pid} /><input type="hidden" name="ids" value={notPaid.filter(b => !waiting(b)).map(b => b.id).join(',')} />
            <span className="cell-sub">{notPaid.filter(b => !waiting(b)).length} can be reminded{notPaid.some(waiting) ? ` · ${notPaid.filter(waiting).length} reminder${notPaid.filter(waiting).length === 1 ? '' : 's'} already waiting to be sent` : ''}</span>
            {notPaid.some(b => !waiting(b)) ? <Submit className="btn sm wa" pendingText="Preparing…">Send electricity reminders ({notPaid.filter(b => !waiting(b)).length})</Submit> : null}</form> : null}
          <div className="tbl-wrap"><table className="el-tbl"><thead><tr><th>Apartment</th><th>Bill</th><th className="r">Still to pay</th><th>Due</th><th>Photo of the bill</th><th className="r">Balance</th><th></th></tr></thead><tbody>
            {notPaid.map(b => { const o = ownerById(b.ownerId), bal = balance(o), ed = elecDue(o);
              return <tr key={b.id} className={b.dueDate < S.today ? 'late' : undefined}>
                <td data-l="Apartment"><Go href={ownerHref(o)}><b>{o.apt}</b></Go><div className="cell-sub">{o.name}</div></td>
                <td data-l="Bill">{utilKind(b)} · {fm(b.period)}<div className="cell-sub">{rs(b.net)}{b.paid > 0 ? ` · ${rs(b.paid)} paid` : ''}{(b.reminders || []).length ? ` · reminded ${(b.reminders || []).length}×` : ''}</div></td>
                <td data-l="Still to pay" className="r num"><b>{rs(left(b))}</b></td>
                <td data-l="Due" style={{ whiteSpace: 'nowrap' }}>{fds(b.dueDate)}{b.dueDate < S.today ? <div><span className="tag bad">Late</span></div> : null}</td>
                <td data-l="Photo of the bill">{photo(b)}</td>
                <td data-l="Balance" className="r num">{rs(Math.max(0, bal))}<div className="cell-sub">maintenance {rs(Math.max(0, bal - ed))} · electricity {rs(ed)}</div></td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>{mgr ? <><Go href={`${base}?${new URLSearchParams({ ...(month ? { period: month } : {}), m: `elecpaid-${b.id}`, oid: o.id })}`} className="btn sm primary"><Ic n="tick" s={15} /> Bill received</Go>
                  {waiting(b) ? <div><span className="tag warn">Reminder waiting</span></div> : <form action={elecReminderAction} style={{ display: 'inline' }}><input type="hidden" name="pid" value={pid} /><input type="hidden" name="ids" value={b.id} /><Submit className="btn sm ghost" pendingText="…">Remind</Submit></form>}</>
                  : <span className="tag warn">Not paid</span>}</td>
              </tr>; })}
          </tbody></table></div></>
          : <Empty kind="done" small title="Every electricity bill here is paid">{month ? `Nothing unpaid for ${fm(month)}.` : 'Nothing unpaid.'}</Empty>)
        : (paid.length ? <div className="tbl-wrap"><table className="el-tbl"><thead><tr><th>Apartment</th><th>Bill</th><th>Paid</th><th>Payment</th><th>Photos</th><th></th></tr></thead><tbody>
            {paid.map(b => { const o = ownerById(b.ownerId), ps = paysFor(b), p = ps[0];
              return <tr key={b.id}>
                <td data-l="Apartment"><Go href={ownerHref(o)}><b>{o.apt}</b></Go><div className="cell-sub">{o.name}</div></td>
                <td data-l="Bill">{utilKind(b)} · {fm(b.period)}<div className="cell-sub">{rs(b.net)} · due {fds(b.dueDate)}</div></td>
                <td data-l="Paid" style={{ whiteSpace: 'nowrap' }}>{p ? fd(p.d) : b.fromCredit ? 'From advance credit' : '—'}</td>
                <td data-l="Payment">{p ? <>{p.receipt} · {/bank/i.test(p.method) ? 'bank transfer' : 'cash'}{ps.length > 1 ? ` (+${ps.length - 1} more)` : ''}<div className="cell-sub">{p.enteredBy ? `entered by ${p.enteredBy}` : p.by}{awaitingApproval(p) ? '' : p.approvedBy ? ` · confirmed by ${p.approvedBy}` : ''}</div>{awaitingApproval(p) ? <span className="tag warn">Waiting for the Accountant</span> : null}</> : <span className="cell-sub">—</span>}</td>
                <td data-l="Photos"><div className="el-photos">{p?.photoId ? <Go href={`/p/${pid}/photo/${p.photoId}`} className="btn sm ghost"><Ic n="image" s={15} /> Payment</Go> : null}{b.photoId ? <Go href={`/p/${pid}/photo/${b.photoId}`} className="btn sm ghost"><Ic n="image" s={15} /> Bill</Go> : null}{!p?.photoId && !b.photoId ? <span className="cell-sub">None</span> : null}</div></td>
                <td className="r"><a className="btn sm" href={`/api/pdf/${pid}/bill/${encodeURIComponent(b.id)}`} target="_blank" rel="noopener">Bill PDF</a></td>
              </tr>; })}
          </tbody></table></div>
          : <Empty kind="done" small title="No paid electricity bills yet">{month ? `None for ${fm(month)}.` : 'Paid bills show here.'}</Empty>)}
        {mgr && !photos ? <div className="callout" style={{ marginTop: 12 }}><div><b>Photos aren&apos;t set up yet.</b> Once the Admin adds the Cloudinary settings in Vercel, bill photos and payment photos are added here.</div></div> : null}
      </div>
    </>;
  });
}
