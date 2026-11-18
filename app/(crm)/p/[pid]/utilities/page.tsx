// Utility bills (Phase 3, 18 Nov 2026: electricity for Oakwood only). The building manager enters each flat's meter
// readings and amount for the month; saving makes each flat's electricity bill at once (its own bill and due date) and
// puts "send electricity bill" in his To do.
import { cur, apartments, aptOrder, billDateOf } from '@/lib/engine';
import { fd, fm, prevMonth, nextMonth, ord, addDays } from '@/lib/fmt';
import { GoSelect } from '@/components/client';
import { Submit } from '@/components/client';
import { UtilityGrid, type GridRow } from '@/components/UtilityGrid';
import { projectPage, projHead } from '@/components/views/project';
import { saveChargesAction, importChargesAction, billUtilitiesNowAction } from '@/lib/actions-desk';

import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/session';
export const dynamic = 'force-dynamic';

export default async function Utilities({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  if ((await requireStaff()).role !== 'manager') redirect(`/p/${pid}?flash=${encodeURIComponent('Utility bills are entered by the building manager.')}`);
  return projectPage(pid, sp, () => {
    const S = cur(), r = S.settings.rules, kinds = r.utilities.length ? r.utilities : ['Electricity'];
    const kind = kinds.includes(sp.kind) ? sp.kind : kinds[0];
    const cm = S.today.slice(0, 7), billDay = billDateOf(cm);
    // Default month: this month until its bills go out, then next month.
    const period = /^\d{4}-\d{2}$/.test(sp.period || '') && sp.period <= cm ? sp.period : cm;
    const months: [string, string][] = []; for (let m = prevMonth(prevMonth(prevMonth(prevMonth(prevMonth(cm))))), i = 0; i < 6; m = nextMonth(m), i++) months.push([m, fm(m)]);
    const flats = apartments().filter(o => o.status === 'active' && o.possession.slice(0, 7) <= period).sort(aptOrder);
    const rows: GridRow[] = flats.map(o => {
      const c = S.charges.filter(x => x.ownerId === o.id && x.period === period && x.kind === kind);
      const billed = c.find(x => x.billId), open = c.find(x => !x.billId), prev = S.charges.find(x => x.ownerId === o.id && x.period === prevMonth(period) && x.kind === kind);
      const last = S.charges.filter(x => x.ownerId === o.id && x.kind === kind && x.period < period && x.curReading != null).sort((a, b) => b.period.localeCompare(a.period))[0];
      const cur0 = billed || open;
      return { oid: o.id, apt: o.apt, block: o.block, type: o.type, name: o.name, units: cur0?.units ?? null, amount: cur0?.amount ?? null, billed: billed?.billId || null, prev: prev ? prev.amount : null,
        prevReading: cur0?.prevReading ?? last?.curReading ?? o.meterIn?.reading ?? null, curReading: cur0?.curReading ?? null };
    });
    const entered = rows.filter(x => x.billed || (x.amount || 0) > 0).length;
    const waiting = S.charges.filter(c => !c.billId && c.amount && c.period < cm || (!c.billId && c.amount && c.period === cm && S.today > billDay)).length;
    const pBill = billDateOf(period);
    const hid = <><input type="hidden" name="pid" value={pid} /><input type="hidden" name="period" value={period} /><input type="hidden" name="kind" value={kind} /></>;
    return <>
      {projHead('utilities')}
      <div className="page-head"><div><h2>Utility bills</h2><p>Enter each flat&apos;s meter reading and {kind.toLowerCase()} bill for the month. Saving makes each flat&apos;s {kind.toLowerCase()} bill straight away, with the due date you pick, and puts it in your To do to send.</p></div>
        <a className="btn" href={`/api/export/utilities?project=${pid}&period=${period}&kind=${encodeURIComponent(kind)}`}>Download sheet (CSV)</a></div>
      <div className={`callout ${entered === rows.length ? 'good' : 'warn'}`} style={{ marginBottom: 14 }}><div><b>{fm(period)}: {entered} of {rows.length} flats entered.</b> Each saved flat gets its own {kind.toLowerCase()} bill at once; billed flats are locked.</div></div>
      {waiting ? <form action={billUtilitiesNowAction} className="callout" style={{ marginBottom: 14, alignItems: 'center' }}>{hid}<div style={{ flex: 1 }}><b>{waiting} utility bill{waiting === 1 ? ' was' : 's were'} entered after the bills went out.</b> They go on the next bill automatically, or you can send them now on their own bill.</div><Submit className="btn sm" pendingText="Sending…">Send them now</Submit></form> : null}
      <div className="card">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <GoSelect name="period" value={period} ariaLabel="Month" style={{ width: 'auto' }} options={months} />
          {kinds.length > 1 ? <GoSelect name="kind" value={kind} ariaLabel="Utility" style={{ width: 'auto' }} options={kinds.map(k => [k, k] as [string, string])} /> : <span className="tag info">{kind}</span>}
          <form action={importChargesAction} className="ut-import">{hid}<input type="file" name="file" accept=".csv,text/csv" aria-label="CSV file" required /><Submit className="btn sm" pendingText="Importing…">Import CSV</Submit></form>
        </div>
        {rows.length ? <UtilityGrid key={`${period}-${kind}`} rows={rows} kind={kind} action={saveChargesAction} pid={pid} period={period} due={addDays(S.today, 15)} readings={kind === 'Electricity'} /> : <p className="empty">No flats were possessed by {fm(period)}.</p>}
      </div>
    </>;
  });
}
