// New: utility bills entry (electricity for Country Club and Oakwood). Entered amounts go on the next bill.
import { cur, apartments, aptOrder, billDateOf } from '@/lib/engine';
import { fd, fm, prevMonth, nextMonth, ord } from '@/lib/fmt';
import { GoSelect } from '@/components/client';
import { Submit } from '@/components/client';
import { UtilityGrid, type GridRow } from '@/components/UtilityGrid';
import { projectPage, projHead } from '@/components/views/project';
import { saveChargesAction, importChargesAction, billUtilitiesNowAction } from '@/lib/actions-desk';

export const dynamic = 'force-dynamic';

export default async function Utilities({ params, searchParams }: { params: Promise<{ pid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid } = await params, sp = await searchParams;
  return projectPage(pid, sp, () => {
    const S = cur(), r = S.settings.rules, kinds = r.utilities.length ? r.utilities : ['Electricity'];
    const kind = kinds.includes(sp.kind) ? sp.kind : kinds[0];
    const cm = S.today.slice(0, 7), billDay = billDateOf(cm);
    // Default month: this month until its bills go out, then next month.
    const period = /^\d{4}-\d{2}$/.test(sp.period || '') ? sp.period : (S.today <= billDay ? cm : nextMonth(cm));
    const months: [string, string][] = []; for (let m = prevMonth(prevMonth(prevMonth(cm))), i = 0; i < 6; m = nextMonth(m), i++) months.push([m, fm(m)]);
    const flats = apartments().filter(o => o.status === 'active' && o.possession.slice(0, 7) <= period).sort(aptOrder);
    const rows: GridRow[] = flats.map(o => {
      const c = S.charges.filter(x => x.ownerId === o.id && x.period === period && x.kind === kind);
      const billed = c.find(x => x.billId), open = c.find(x => !x.billId), prev = S.charges.find(x => x.ownerId === o.id && x.period === prevMonth(period) && x.kind === kind);
      return { oid: o.id, apt: o.apt, block: o.block, type: o.type, name: o.name, units: (billed || open)?.units ?? null, amount: (billed || open)?.amount ?? null, billed: billed?.billId || null, prev: prev ? prev.amount : null };
    });
    const entered = rows.filter(x => x.billed || (x.amount || 0) > 0).length;
    const waiting = S.charges.filter(c => !c.billId && c.amount && c.period < cm || (!c.billId && c.amount && c.period === cm && S.today > billDay)).length;
    const pBill = billDateOf(period);
    const hid = <><input type="hidden" name="pid" value={pid} /><input type="hidden" name="period" value={period} /><input type="hidden" name="kind" value={kind} /></>;
    return <>
      {projHead('utilities')}
      <div className="page-head"><div><h2>Utility bills</h2><p>Enter each flat&apos;s {kind.toLowerCase()} bill for the month. Everything entered by the {ord(r.billDay)} goes on that month&apos;s bill to the owner; anything later goes on the next one.</p></div>
        <a className="btn" href={`/api/export/utilities?project=${pid}&period=${period}&kind=${encodeURIComponent(kind)}`}>Download sheet (CSV)</a></div>
      <div className={`callout ${entered === rows.length ? 'good' : 'warn'}`} style={{ marginBottom: 14 }}><div><b>{fm(period)}: {entered} of {rows.length} flats entered.</b> {pBill >= S.today ? `They go out with the bills on ${fd(pBill)} at ${r.sendHour}:00.` : `This month's bills went out on ${fd(pBill)}; what you enter now goes on the next bill.`}</div></div>
      {waiting ? <form action={billUtilitiesNowAction} className="callout" style={{ marginBottom: 14, alignItems: 'center' }}>{hid}<div style={{ flex: 1 }}><b>{waiting} utility bill{waiting === 1 ? ' was' : 's were'} entered after the bills went out.</b> They go on the next bill automatically, or you can send them now on their own bill.</div><Submit className="btn sm" pendingText="Sending…">Send them now</Submit></form> : null}
      <div className="card">
        <div className="toolbar" style={{ marginBottom: 14 }}>
          <GoSelect name="period" value={period} ariaLabel="Month" style={{ width: 'auto' }} options={months} />
          {kinds.length > 1 ? <GoSelect name="kind" value={kind} ariaLabel="Utility" style={{ width: 'auto' }} options={kinds.map(k => [k, k] as [string, string])} /> : <span className="tag info">{kind}</span>}
          <form action={importChargesAction} className="ut-import">{hid}<input type="file" name="file" accept=".csv,text/csv" aria-label="CSV file" required /><Submit className="btn sm" pendingText="Importing…">Import CSV</Submit></form>
        </div>
        {rows.length ? <UtilityGrid key={`${period}-${kind}`} rows={rows} kind={kind} action={saveChargesAction} pid={pid} period={period} /> : <p className="empty">No flats were possessed by {fm(period)}.</p>}
      </div>
    </>;
  });
}
