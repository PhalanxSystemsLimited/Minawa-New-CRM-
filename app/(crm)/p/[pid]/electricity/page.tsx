// Electricity bills (Oakwood; Utility bills and Electricity bills in one screen since 21 Nov 2026). Two buttons on top:
//  · Bills (the default): every customer's electricity bills. Unpaid ones can still be corrected by the building
//    manager (Edit) and marked received (Bill received, with a photo); paid ones are the bill history and are locked.
//    The rows don't open anything.
//  · Add electricity bills (building manager): every Oakwood customer with Enter bill: the amount, units and the
//    meter reading on the bill (and its due date and photo). Saving bills the customer at once; the bill waits in Send
//    on WhatsApp. The customer's balance includes maintenance and electricity; electricity reminders go on their own.
import { cur, ownerById, balance, elecDue, isUtilBill, utilKind, awaitingApproval, apartments, aptOrder } from '@/lib/engine';
import type { Bill, Payment, Owner } from '@/lib/types';
import { rs, fd, fds, fm, addDays, prevMonth, ord } from '@/lib/fmt';
import { Go, GoSelect, Submit, ModalShell, CloseBtn } from '@/components/client';
import { PhotoField } from '@/components/PhotoField';
import { Ic } from '@/components/icons';
import { Empty, KIc } from '@/components/views/art';
import { projectPage, projHead } from '@/components/views/project';
import { elecReminderAction } from '@/lib/actions-photos';
import { addElecBillAction, editElecBillAction, readingAction, elecFineAction } from '@/lib/actions-elec';
import { meterMode, unitRate, lastReading, readDay, fineOfferFor, hasFine, fineSteps } from '@/lib/meter';
import { pendingFor } from '@/lib/approvals';
import { MeterGrid, type MeterRow } from '@/components/MeterGrid';
import { elecLocked, elecCharge } from '@/lib/elec';
import { custId } from '@/lib/people';
import { photoStore } from '@/lib/images';
import { MoreBar, shownOf } from '@/components/views/more';

export const dynamic = 'force-dynamic';

export default async function Electricity({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), mgr = S.role === 'manager', photos = !!photoStore(), base = `/p/${pid}/electricity`;
    if (!S.settings.rules.utilities.includes('Electricity')) return <>{projHead('electricity')}<Empty card kind="done" title="No electricity bills here">Electricity is billed only where it is switched on in Settings (Oakwood).</Empty></>;
    const tab = sp.tab === 'add' && mgr ? 'add' : 'bills', meter = meterMode(), rate = unitRate(S.today);
    const all = S.bills.filter(b => isUtilBill(b) && ownerById(b.ownerId)).sort((a, b) => b.period.localeCompare(a.period) || ownerById(a.ownerId).apt.localeCompare(ownerById(b.ownerId).apt, 'en', { numeric: true }));
    const left = (b: Bill) => Math.max(0, b.net - b.paid);
    const paysFor = (b: Bill): Payment[] => S.payments.filter(p => !p.reversed && p.applied.some(a => a.ref === b.id)).sort((x, y) => (y.d + y.t).localeCompare(x.d + x.t));
    const waiting = (b: Bill) => S.messages.some(m => m.status === 'pending' && m.tpl === 'elec' && m.pdf?.id === b.id);
    const sum = (l: Bill[], f: (b: Bill) => number) => l.reduce((a, b) => a + f(b), 0);
    const ch = (b: Bill) => elecCharge(b);
    const top = <div className="seg-tabs no-print" role="tablist" aria-label="Electricity bills">
      <Go href={base} className="seg-tab" current={tab === 'bills' ? 'true' : 'false'}><Ic n="receipt" s={16} /> Bills</Go>
      {mgr ? <Go href={`${base}?tab=add`} className="seg-tab" current={tab === 'add' ? 'true' : 'false'}><Ic n={meter ? 'gauge' : 'plus'} s={16} /> {meter ? 'Enter readings' : 'Add electricity bills'}</Go> : null}
    </div>;

    // ---------- the bill windows (enter one, or correct one) ----------
    let modal: React.ReactNode = null;
    const due0 = addDays(S.today, 15);
    if (mgr && sp.m === 'elecadd' && sp.oid) {
      const o = ownerById(sp.oid), period = /^\d{4}-\d{2}$/.test(sp.period || '') ? sp.period! : S.today.slice(0, 7);
      const last = o ? S.charges.filter(c => c.ownerId === o.id && c.kind === 'Electricity' && c.curReading != null).sort((a, b) => b.period.localeCompare(a.period))[0] : null;
      modal = o ? <ModalShell title={`Electricity bill · ${o.apt}`} closeKeys={['m', 'oid']}><form action={addElecBillAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="hidden" name="pid" value={pid} /><input type="hidden" name="oid" value={o.id} />{sp.q ? <input type="hidden" name="q" value={sp.q} /> : null}
        <div className="callout">{o.name} ({custId(o)}), {o.apt}. Saving bills {o.name.split(' ')[0]} at once; the bill waits in Send on WhatsApp. You can correct it until it is paid.</div>
        <div className="grid2" style={{ gap: 10 }}>
          <div className="form-row"><label htmlFor="eb-m">Bill month</label><input id="eb-m" name="period" type="month" required defaultValue={period} max={S.today.slice(0, 7)} /></div>
          <div className="form-row"><label htmlFor="eb-d">Due date</label><input id="eb-d" name="due" type="date" required defaultValue={due0} min={S.today} /></div>
          <div className="form-row"><label htmlFor="eb-a">Bill amount (Rs) <span className="req"> required</span></label><input id="eb-a" name="amount" type="number" min="1" step="1" required inputMode="numeric" /></div>
          <div className="form-row"><label htmlFor="eb-u">Units <span className="req"> required</span></label><input id="eb-u" name="units" type="number" min="0" step="1" required inputMode="numeric" /></div>
          <div className="form-row"><label htmlFor="eb-r">Meter reading on the bill <span className="req"> required</span></label><input id="eb-r" name="reading" type="number" min="0" step="1" required inputMode="numeric" />
            <div className="cell-sub">{last ? `Last bill: ${last.curReading} (${fm(last.period)})` : o.meterIn ? `At possession: ${o.meterIn.reading}` : 'No earlier reading on file'}</div></div>
        </div>
        {photos ? <PhotoField pid={pid} kind="bill" owner={o.id} label="Photo of the bill" hint="Optional. Printed on the bill the customer gets on WhatsApp." /> : null}
        <div className="m-actions"><CloseBtn keys={['m', 'oid']} /><Submit>Save and bill {o.apt}</Submit></div></form></ModalShell>
        : null;
    } else if (mgr && sp.m?.startsWith('elecedit-')) {
      const b = S.bills.find(x => x.id === sp.m!.slice(9)), o = b ? ownerById(b.ownerId) : null, c = b ? ch(b) : null, why = b ? elecLocked(b) : 'not found';
      modal = <ModalShell title={b && o ? `Correct the bill · ${o.apt}, ${fm(b.period)}` : 'Correct the bill'} closeKeys={['m']}>{!b || !o || !c || why
        ? <><div className="callout">{!b ? 'This bill isn\'t there any more.' : !c ? 'This bill wasn\'t entered here, so it can\'t be corrected here.' : `This bill can't be changed: ${why!.toLowerCase()}.`}</div><div className="m-actions"><CloseBtn keys={['m']} label="Close" /></div></>
        : <form action={editElecBillAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="hidden" name="pid" value={pid} /><input type="hidden" name="bill" value={b.id} /><input type="hidden" name="from" value={tab} /><input type="hidden" name="period" value={sp.period || ''} />
          <div className="callout warn"><div>{o.name}&apos;s {fm(b.period)} bill ({b.id}), {rs(b.net)}. Nothing has been paid on it yet, so it can still be corrected; {o.name.split(' ')[0]} is sent the corrected bill. Once paid, it can&apos;t be changed.</div></div>
          {meter && c.prevReading != null ? <><input type="hidden" name="meter" value="1" />
            <div className="grid2" style={{ gap: 10 }}>
              <div className="form-row"><label htmlFor="ee-p">Previous reading</label><input id="ee-p" name="prev" type="number" min="0" step="1" required defaultValue={c.prevReading} /><div className="cell-sub">From the last bill or the possession reading; change it only if it was wrong.</div></div>
              <div className="form-row"><label htmlFor="ee-r">Reading</label><input id="ee-r" name="reading" type="number" min="0" step="1" required defaultValue={c.curReading ?? ''} /><div className="cell-sub">Units × {rs(unitRate(b.billDate))} (the rate on the bill date).</div></div>
              <div className="form-row"><label htmlFor="ee-d">Due date</label><input id="ee-d" name="due" type="date" required defaultValue={b.dueDate} /></div>
            </div></>
          : <div className="grid2" style={{ gap: 10 }}>
            <div className="form-row"><label htmlFor="ee-a">Bill amount (Rs)</label><input id="ee-a" name="amount" type="number" min="1" step="1" required defaultValue={c.amount} /></div>
            <div className="form-row"><label htmlFor="ee-u">Units</label><input id="ee-u" name="units" type="number" min="0" step="1" required defaultValue={c.units ?? ''} /></div>
            <div className="form-row"><label htmlFor="ee-r">Meter reading on the bill</label><input id="ee-r" name="reading" type="number" min="0" step="1" required defaultValue={c.curReading ?? ''} /></div>
            <div className="form-row"><label htmlFor="ee-d">Due date</label><input id="ee-d" name="due" type="date" required defaultValue={b.dueDate} /></div>
          </div>}
          <div className="m-actions"><CloseBtn keys={['m']} /><Submit>Save the corrected bill</Submit></div></form>}</ModalShell>;
    } else if (mgr && meter && sp.m === 'reading' && sp.oid) {
      const o = ownerById(sp.oid), period = /^\d{4}-\d{2}$/.test(sp.period || '') ? sp.period! : S.today.slice(0, 7), last = o ? lastReading(o, period) : null;
      modal = o ? <ModalShell title={`Meter reading · ${o.apt}`} closeKeys={['m', 'oid']}><form action={readingAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="hidden" name="pid" value={pid} /><input type="hidden" name="oid" value={o.id} /><input type="hidden" name="period" value={period} />{sp.q ? <input type="hidden" name="q" value={sp.q} /> : null}
        <div className="callout">{o.name} ({custId(o)}), {o.apt}: {fm(period)}. Units since the last reading × {rs(rate)} a unit; the bill waits in Send on WhatsApp.</div>
        <div className="grid2" style={{ gap: 10 }}>
          <div className="form-row"><label htmlFor="rd-p">Last reading</label>{last ? <><input id="rd-p" type="text" value={last.value} readOnly /><div className="cell-sub">{last.from}</div></> : <><input id="rd-p" name="prev" type="number" min="0" step="1" required /><div className="cell-sub">None on file: enter the previous reading.</div></>}</div>
          <div className="form-row"><label htmlFor="rd-c">Reading now <span className="req"> required</span></label><input id="rd-c" name="cur" type="number" min={last?.value ?? 0} step="1" required inputMode="numeric" /></div>
        </div>
        {photos ? <PhotoField pid={pid} kind="bill" owner={o.id} label="Photo of the meter" hint="Optional. Printed on the bill the customer gets on WhatsApp." /> : null}
        <div className="m-actions"><CloseBtn keys={['m', 'oid']} /><Submit>Save and bill {o.apt}</Submit></div></form></ModalShell> : null;
    } else if (sp.m?.startsWith('elecfine-') && (mgr || S.role === 'admin')) {
      const b = S.bills.find(x => x.id === sp.m!.slice(9)), o = b ? ownerById(b.ownerId) : null, f = b ? fineOfferFor(b, S.today) : null, asked = o ? pendingFor(o).some(a => a.kind === 'elecfine' && a.change.billId === b!.id) : false;
      modal = <ModalShell title={o ? `Late fine · ${o.apt}` : 'Late fine'} closeKeys={['m']}>{!b || !o || !f ? <><div className="callout">This bill isn&apos;t there any more.</div><div className="m-actions"><CloseBtn keys={['m']} label="Close" /></div></>
        : asked ? <><div className="callout warn"><div>A late fine for this bill is already waiting for the Admin.</div></div><div className="m-actions"><CloseBtn keys={['m']} label="Close" /></div></>
        : hasFine(b) ? <><div className="callout">This bill already has a late fine.</div><div className="m-actions"><CloseBtn keys={['m']} label="Close" /></div></>
        : !f.pct ? <><div className="callout">{f.late > 0 ? `${f.late} day${f.late === 1 ? '' : 's'} late: no fine applies yet.` : 'The bill isn\'t late yet.'} {fineSteps().length ? `The Admin's steps: ${fineSteps().map(x => `${x.pct}% from ${x.days} days late`).join(', ')}.` : 'The Admin hasn\'t set a late fine (Settings › Electricity).'}</div><div className="m-actions"><CloseBtn keys={['m']} label="Close" /></div></>
        : <form action={elecFineAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}><input type="hidden" name="pid" value={pid} /><input type="hidden" name="bill" value={b.id} />
          <div className="callout warn"><div>{o.name}&apos;s {fm(b.period)} electricity bill was due {fd(b.dueDate)}: <b>{f.late} days late</b>, {rs(f.left)} unpaid. The Admin&apos;s fine now is <b>{f.pct}%</b> = <b>{rs(f.amount)}</b>, added to this bill{S.role === 'admin' ? '.' : ' once the Admin approves it.'}</div></div>
          <div className="form-row"><label htmlFor="ef-r">Why fine {o.name.split(' ')[0]} now{S.role === 'admin' ? ' (optional)' : ' (for the Admin)'}</label><input id="ef-r" name="reason" type="text" required={S.role !== 'admin'} placeholder="e.g. Reminded three times, no reply" /></div>
          <div className="m-actions"><CloseBtn keys={['m']} /><Submit>{S.role === 'admin' ? `Add the fine (${rs(f.amount)})` : 'Ask the Admin to approve'}</Submit></div></form>}</ModalShell>;
    }

    // ---------- Sub-meters: Enter readings (every customer, this month's reading) ----------
    if (tab === 'add' && meter) {
      const period = /^\d{4}-\d{2}$/.test(sp.period || '') && sp.period! <= S.today.slice(0, 7) ? sp.period! : S.today.slice(0, 7), q = (sp.q || '').trim().toLowerCase();
      const months: [string, string][] = []; for (let m = S.today.slice(0, 7), i = 0; i < 12; m = prevMonth(m), i++) months.push([m, fm(m)]);
      const cust = apartments().filter(o => o.status === 'active').sort(aptOrder);
      const billOf = (o: Owner) => all.find(b => b.ownerId === o.id && b.period === period && ch(b));
      const list = cust.filter(o => !q || `${o.apt} ${o.name} ${custId(o)} ${o.phone}`.toLowerCase().includes(q));
      const done = cust.filter(o => billOf(o)).length, shown = shownOf(sp.n, list.length), page = list.slice(0, shown);
      const href = (k: Record<string, string>) => `${base}?${new URLSearchParams(Object.entries({ tab: 'add', period, q: sp.q || '', ...k }).filter(([, v]) => v))}`;
      const rows: MeterRow[] = page.map(o => { const b = billOf(o) || null, c = b ? ch(b) : null, last = lastReading(o, period);
        const past = S.charges.filter(x => x.ownerId === o.id && x.kind === 'Electricity' && x.units != null && x.period < period).slice(-6), avg = past.length ? past.reduce((a, x) => a + (x.units || 0), 0) / past.length : null;
        return { oid: o.id, apt: o.apt, sub: [o.block && `Block ${o.block}`, o.floor].filter(Boolean).join(' · '), name: o.name, cid: custId(o), prev: last?.value ?? null, prevFrom: last?.from || '', avg,
          billed: b ? { net: rs(b.net), units: c?.units ?? null, cur: c?.curReading ?? null, locked: !!elecLocked(b), editHref: href({ m: `elecedit-${b.id}`, n: sp.n || '' }) } : null, photoHref: href({ m: 'reading', oid: o.id, n: sp.n || '' }) }; });
      return <>
        {projHead('electricity')}
        <div className="page-head"><div><h2>Electricity bills</h2><p>Enter each flat&apos;s sub-meter reading. The bill is the units used since the last reading × <b>{rate ? `${rs(rate)} a unit` : 'the unit rate'}</b> (set by the Admin); it waits in <b>Send on WhatsApp</b> and is due {S.settings.rules.elecDueDays ?? 15} days after it is made. Readings are taken on the {ord(readDay())} of each month. A bill can be corrected until it is paid.</p></div></div>
        {top}
        {!rate ? <div className="callout bad"><div><b>The unit rate isn&apos;t set.</b> The Admin sets it in Settings › Electricity; readings can be entered after that.</div></div> : null}
        <div className="kpis">
          <div className="kpi"><KIc n="users" tone="blue" /><div className="l">Customers</div><div className="v num">{cust.length}</div><div className="cell-sub">active in {S.proj.name}</div></div>
          <div className="kpi"><KIc n="okc" tone="green" /><div className="l">Read for {fm(period)}</div><div className="v num">{done}</div><div className="cell-sub">{rs(sum(all.filter(b => b.period === period && ch(b)), b => b.net))} billed</div></div>
          <div className="kpi"><KIc n="gauge" tone="amber" /><div className="l">Still to read</div><div className="v num">{cust.length - done}</div><div className="cell-sub">for {fm(period)}</div></div>
          <div className="kpi"><KIc n="bolt" tone="violet" /><div className="l">Unit rate</div><div className="v num">{rate ? rs(rate) : '—'}</div><div className="cell-sub">set by the Admin</div></div>
        </div>
        <div className="card">
          <div className="toolbar el-tools">
            <GoSelect name="period" value={period} ariaLabel="Month" style={{ width: 'auto' }} options={months} />
            <form action={base} className="el-search"><input type="hidden" name="tab" value="add" /><input type="hidden" name="period" value={period} />
              <input type="search" name="q" defaultValue={sp.q || ''} placeholder="Apartment, name or customer ID" aria-label="Search customers" /></form>
          </div>
          {rate ? (rows.length ? <><MeterGrid pid={pid} period={period} periodLabel={fm(period)} rate={rate} rows={rows} q={sp.q || ''} /><MoreBar shown={shown} total={list.length} noun="customer" href={n => href({ n })} /></>
            : <Empty kind="search" small title={q ? `No customer matches "${sp.q}"` : 'No active customers here'} />) : null}
        </div>
        {modal}
      </>;
    }

    // ---------- Add electricity bills: every customer, enter or correct this month's bill ----------
    if (tab === 'add') {
      const period = /^\d{4}-\d{2}$/.test(sp.period || '') && sp.period! <= S.today.slice(0, 7) ? sp.period! : S.today.slice(0, 7), q = (sp.q || '').trim().toLowerCase();
      const months: [string, string][] = []; for (let m = S.today.slice(0, 7), i = 0; i < 12; m = prevMonth(m), i++) months.push([m, fm(m)]);
      const cust = apartments().filter(o => o.status === 'active').sort(aptOrder);
      const billOf = (o: Owner) => all.find(b => b.ownerId === o.id && b.period === period && ch(b));
      const rows = cust.map(o => ({ o, b: billOf(o) || null })).filter(r => !q || `${r.o.apt} ${r.o.name} ${custId(r.o)} ${r.o.phone}`.toLowerCase().includes(q));
      const done = cust.filter(o => billOf(o)).length, shown = shownOf(sp.n, rows.length), page = rows.slice(0, shown);
      const href = (k: Record<string, string>) => `${base}?${new URLSearchParams(Object.entries({ tab: 'add', period, q: sp.q || '', ...k }).filter(([, v]) => v))}`;
      return <>
        {projHead('electricity')}
        <div className="page-head"><div><h2>Electricity bills</h2><p>Enter each customer&apos;s bill from the paper bill: the amount, the units and the meter reading on it. Saving bills the customer at once; it waits in <b>Send on WhatsApp</b>. A bill can be corrected until it is paid.</p></div></div>
        {top}
        <div className="kpis">
          <div className="kpi"><KIc n="users" tone="blue" /><div className="l">Customers</div><div className="v num">{cust.length}</div><div className="cell-sub">active in {S.proj.name}</div></div>
          <div className="kpi"><KIc n="okc" tone="green" /><div className="l">Billed for {fm(period)}</div><div className="v num">{done}</div><div className="cell-sub">{rs(sum(all.filter(b => b.period === period && ch(b)), b => b.net))}</div></div>
          <div className="kpi"><KIc n="bolt" tone="amber" /><div className="l">Still to enter</div><div className="v num">{cust.length - done}</div><div className="cell-sub">for {fm(period)}</div></div>
        </div>
        <div className="card">
          <div className="toolbar el-tools">
            <GoSelect name="period" value={period} ariaLabel="Bill month" style={{ width: 'auto' }} options={months} />
            <form action={base} className="el-search"><input type="hidden" name="tab" value="add" /><input type="hidden" name="period" value={period} />
              <input type="search" name="q" defaultValue={sp.q || ''} placeholder="Apartment, name or customer ID" aria-label="Search customers" /></form>
            <span style={{ flex: 1 }} />
            <Go href={`/p/${pid}/utilities?period=${period}&kind=Electricity`} className="btn sm"><Ic n="list" s={15} /> Whole month on one sheet</Go>
          </div>
          {page.length ? <><div className="tbl-wrap"><table className="el-tbl"><thead><tr><th>Apartment</th><th>Customer</th><th>{fm(period)} bill</th><th>Last meter reading</th><th className="r"></th></tr></thead><tbody>
            {page.map(({ o, b }) => { const c = b ? ch(b) : null, lock = b ? elecLocked(b) : null;
              const last = S.charges.filter(x => x.ownerId === o.id && x.kind === 'Electricity' && x.curReading != null).sort((x, y) => y.period.localeCompare(x.period))[0];
              return <tr key={o.id}>
                <td data-l="Apartment"><b>{o.apt}</b><div className="cell-sub">{[o.block && `Block ${o.block}`, o.floor].filter(Boolean).join(' · ')}</div></td>
                <td data-l="Customer"><b>{o.name}</b><div className="cell-sub num">{custId(o)}</div></td>
                <td data-l="Bill">{b ? <><b className="num">{rs(b.net)}</b> <span className="cell-sub">{c?.units != null ? `${c.units} units` : ''}</span><div>{lock ? <span className="tag good">Paid · history</span> : <span className="tag warn">Billed · unpaid</span>}</div></> : <span className="cell-sub">Not entered yet</span>}</td>
                <td data-l="Last meter reading" className="num">{last ? <>{last.curReading}<div className="cell-sub">{fm(last.period)}</div></> : o.meterIn ? <>{o.meterIn.reading}<div className="cell-sub">at possession</div></> : <span className="cell-sub">—</span>}</td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>{!b ? <Go href={href({ m: 'elecadd', oid: o.id, n: sp.n || '' })} className="btn sm primary"><Ic n="plus" s={15} /> Enter bill</Go>
                  : !lock ? <Go href={href({ m: `elecedit-${b.id}`, n: sp.n || '' })} className="btn sm"><Ic n="edit" s={15} /> Edit</Go> : <span className="cell-sub">Locked</span>}</td>
              </tr>; })}
          </tbody></table></div><MoreBar shown={shown} total={rows.length} noun="customer" href={n => href({ n })} /></>
            : <Empty kind="search" small title={q ? `No customer matches "${sp.q}"` : 'No active customers here'} />}
        </div>
        {modal}
      </>;
    }

    // ---------- Bills: unpaid ones (can be corrected) and the history (paid, locked) ----------
    const months = [...new Set(all.map(b => b.period))].sort().reverse();
    const month = months.includes(sp.period) ? sp.period : '';
    const q = (sp.q || '').trim().toLowerCase();
    const list = all.filter(b => (!month || b.period === month) && (!q || (() => { const o = ownerById(b.ownerId); return `${o.apt} ${o.name} ${o.phone} ${custId(o)}`.toLowerCase().includes(q); })()));
    const notPaid = list.filter(b => left(b) > 0), paid = list.filter(b => left(b) <= 0);
    const view = sp.v === 'paid' ? 'paid' : 'unpaid';
    const href = (k: Record<string, string>) => base + '?' + new URLSearchParams(Object.entries({ period: month, q: sp.q || '', v: view, ...k }).filter(([, x]) => x)).toString();
    const late = notPaid.filter(b => b.dueDate < S.today);
    const rows = view === 'unpaid' ? notPaid : paid, shown = shownOf(sp.n, rows.length), page = rows.slice(0, shown);
    const photo = (b: Bill) => mgr && photos
      ? <PhotoField pid={pid} kind="bill" owner={b.ownerId} attach={{ billId: b.id }} current={b.photoId || null} label="Photo of the bill" small />
      : b.photoId ? <a className="ph-thumb" href={`/api/img/${b.photoId}`} target="_blank" rel="noopener" title="Photo of the bill"><img src={`/api/img/${b.photoId}`} alt="Photo of the bill" /></a> : <span className="cell-sub">No photo</span>;
    const billCell = (b: Bill) => { const c = ch(b); return <>{utilKind(b)} · {fm(b.period)}<div className="cell-sub">{rs(b.net)}{c?.units != null ? ` · ${c.units} units` : ''}{c?.prevReading != null && c?.curReading != null ? ` · meter ${c.prevReading} → ${c.curReading}` : c?.curReading != null ? ` · meter ${c.curReading}` : ''}{b.paid > 0 && left(b) > 0 ? ` · ${rs(b.paid)} paid` : ''}</div></>; };
    return <>
      {projHead('electricity')}
      <div className="page-head"><div><h2>Electricity bills</h2><p>Who has paid their electricity bill and who hasn&apos;t. {mgr ? <>Correct an unpaid bill with <b>Edit</b>; when a customer pays, press <b>Bill received</b> and add a photo. Paid bills are the history and can&apos;t be changed. New bills are entered under <b>Add electricity bills</b>.</> : 'The building manager enters the bills, corrects unpaid ones and marks them received. Paid bills are the history and can\'t be changed.'} Customers&apos; balances include maintenance and electricity.</p></div></div>
      {top}
      <div className="kpis">
        <div className="kpi"><KIc n="alert" tone="amber" /><div className="l">Not paid</div><div className="v num">{notPaid.length}</div><div className="cell-sub">{rs(sum(notPaid, left))} to collect</div></div>
        <div className="kpi"><KIc n="clock" tone="red" /><div className="l">Past the due date</div><div className="v num">{late.length}</div><div className="cell-sub">{rs(sum(late, left))}</div></div>
        <div className="kpi"><KIc n="okc" tone="green" /><div className="l">Paid · history</div><div className="v num">{paid.length}</div><div className="cell-sub">{rs(sum(list, b => b.paid))} collected</div></div>
        <div className="kpi"><KIc n="camera" tone="blue" /><div className="l">Bill photos</div><div className="v num">{list.filter(b => b.photoId).length} / {list.length}</div><div className="cell-sub">printed on the bills</div></div>
      </div>
      <div className="card">
        <div className="toolbar el-tools">
          <div className="ptabs" role="tablist">
            <Go href={href({ v: 'unpaid' })} current={view === 'unpaid' ? 'true' : 'false'} replace>Not paid <span className="tab-b">{notPaid.length}</span></Go>
            <Go href={href({ v: 'paid' })} current={view === 'paid' ? 'true' : 'false'} replace>Bill history (paid) <span className="tab-new">{paid.length}</span></Go>
          </div>
          <GoSelect name="period" value={month} ariaLabel="Month" style={{ width: 'auto' }} options={[['', 'All months'], ...months.map(m => [m, fm(m)] as [string, string])]} />
          <form action={base} className="el-search"><input type="hidden" name="v" value={view} />{month ? <input type="hidden" name="period" value={month} /> : null}
            <input type="search" name="q" defaultValue={sp.q || ''} placeholder="Apartment, name or customer ID" aria-label="Search" /></form>
        </div>
        {view === 'unpaid' ? (notPaid.length ? <>
          {mgr ? <form action={elecReminderAction} className="el-bulk"><input type="hidden" name="pid" value={pid} /><input type="hidden" name="ids" value={notPaid.filter(b => !waiting(b)).map(b => b.id).join(',')} />
            <span className="cell-sub">{notPaid.filter(b => !waiting(b)).length} can be reminded{notPaid.some(waiting) ? ` · ${notPaid.filter(waiting).length} reminder${notPaid.filter(waiting).length === 1 ? '' : 's'} already waiting to be sent` : ''}</span>
            {notPaid.some(b => !waiting(b)) ? <Submit className="btn sm wa" pendingText="Preparing…">Send electricity reminders ({notPaid.filter(b => !waiting(b)).length})</Submit> : null}</form> : null}
          <div className="tbl-wrap"><table className="el-tbl"><thead><tr><th>Apartment</th><th>Bill</th><th className="r">Still to pay</th><th>Due</th><th>Photo of the bill</th><th className="r">Balance</th><th></th></tr></thead><tbody>
            {page.map(b => { const o = ownerById(b.ownerId), bal = balance(o), ed = elecDue(o), lock = elecLocked(b);
              return <tr key={b.id} className={b.dueDate < S.today ? 'late' : undefined}>
                <td data-l="Apartment"><b>{o.apt}</b><div className="cell-sub">{o.name} · {custId(o)}</div></td>
                <td data-l="Bill">{billCell(b)}{(b.reminders || []).length ? <div className="cell-sub">reminded {(b.reminders || []).length}×</div> : null}</td>
                <td data-l="Still to pay" className="r num"><b>{rs(left(b))}</b></td>
                <td data-l="Due" style={{ whiteSpace: 'nowrap' }}>{fds(b.dueDate)}{b.dueDate < S.today ? <div><span className="tag bad">Late</span></div> : null}</td>
                <td data-l="Photo of the bill">{photo(b)}</td>
                <td data-l="Balance" className="r num">{rs(Math.max(0, bal))}<div className="cell-sub">maintenance {rs(Math.max(0, bal - ed))} · electricity {rs(ed)}</div></td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>{mgr ? <div className="el-acts">
                  <Go href={`${base}?${new URLSearchParams({ ...(month ? { period: month } : {}), m: `elecpaid-${b.id}`, oid: o.id })}`} className="btn sm primary"><Ic n="tick" s={15} /> Bill received</Go>
                  {!lock && ch(b) ? <Go href={href({ m: `elecedit-${b.id}`, n: sp.n || '' })} className="btn sm"><Ic n="edit" s={15} /> Edit</Go> : null}
                  {b.dueDate < S.today && !hasFine(b) && fineSteps().length ? pendingFor(o).some(a => a.kind === 'elecfine' && a.change.billId === b.id) ? <span className="tag info">Fine waiting for approval</span>
                    : <Go href={href({ m: `elecfine-${b.id}`, n: sp.n || '' })} className="btn sm"><Ic n="flag" s={15} /> Fine{fineOfferFor(b, S.today).pct ? ` ${fineOfferFor(b, S.today).pct}%` : ''}</Go> : null}
                  {waiting(b) ? <span className="tag warn">Reminder waiting</span> : <form action={elecReminderAction} style={{ display: 'inline' }}><input type="hidden" name="pid" value={pid} /><input type="hidden" name="ids" value={b.id} /><Submit className="btn sm ghost" pendingText="…">Remind</Submit></form>}</div>
                  : <span className="tag warn">Not paid</span>}</td>
              </tr>; })}
          </tbody></table></div><MoreBar shown={shown} total={rows.length} noun="bill" href={n => href({ n })} /></>
          : <Empty kind="done" small title="Every electricity bill here is paid">{month ? `Nothing unpaid for ${fm(month)}.` : 'Nothing unpaid.'}</Empty>)
        : (paid.length ? <><div className="tbl-wrap"><table className="el-tbl"><thead><tr><th>Apartment</th><th>Bill</th><th>Paid</th><th>Payment</th><th>Photos</th><th></th></tr></thead><tbody>
            {page.map(b => { const o = ownerById(b.ownerId), ps = paysFor(b), p = ps[0];
              return <tr key={b.id}>
                <td data-l="Apartment"><b>{o.apt}</b><div className="cell-sub">{o.name} · {custId(o)}</div></td>
                <td data-l="Bill">{billCell(b)}<div className="cell-sub">due {fds(b.dueDate)}</div></td>
                <td data-l="Paid" style={{ whiteSpace: 'nowrap' }}>{p ? fd(p.d) : b.fromCredit ? 'From advance credit' : '—'}</td>
                <td data-l="Payment">{p ? <>{p.receipt} · {/bank/i.test(p.method) ? 'bank transfer' : 'cash'}{ps.length > 1 ? ` (+${ps.length - 1} more)` : ''}<div className="cell-sub">{p.enteredBy ? `entered by ${p.enteredBy}` : p.by}{awaitingApproval(p) ? '' : p.approvedBy ? ` · confirmed by ${p.approvedBy}` : ''}</div>{awaitingApproval(p) ? <span className="tag warn">Waiting for the Accountant</span> : null}</> : <span className="cell-sub">—</span>}</td>
                <td data-l="Photos"><div className="el-photos">{p?.photoId ? <Go href={`/p/${pid}/photo/${p.photoId}`} className="btn sm ghost"><Ic n="image" s={15} /> Payment</Go> : null}{b.photoId ? <Go href={`/p/${pid}/photo/${b.photoId}`} className="btn sm ghost"><Ic n="image" s={15} /> Bill</Go> : null}{!p?.photoId && !b.photoId ? <span className="cell-sub">None</span> : null}</div></td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}><span className="tag good" title="Paid bills can't be changed">Locked</span> <a className="btn sm" href={`/api/pdf/${pid}/bill/${encodeURIComponent(b.id)}`} target="_blank" rel="noopener">Bill PDF</a></td>
              </tr>; })}
          </tbody></table></div><MoreBar shown={shown} total={rows.length} noun="bill" href={n => href({ n })} /></>
          : <Empty kind="done" small title="No paid electricity bills yet">{month ? `None for ${fm(month)}.` : 'Paid bills show here, with their payment, and can\'t be changed.'}</Empty>)}
        {mgr && !photos ? <div className="callout" style={{ marginTop: 12 }}><div><b>Photos aren&apos;t set up yet.</b> Once the Admin adds the Cloudinary settings in Vercel, bill photos and payment photos are added here.</div></div> : null}
      </div>
      {modal}
    </>;
  });
}
