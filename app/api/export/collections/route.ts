// The monthly collection report as an Excel workbook (Reports): per building, billed vs collected, who took the cash,
// and each payment of the month.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { monthReport } from '@/lib/reports';
import { use, ownerById } from '@/lib/engine';
import { todayPKT, t12, fm, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project'), q = u.searchParams.get('month') || '', month = /^\d{4}-\d{2}$/.test(q) ? q : todayPKT().slice(0, 7);
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const states = await Promise.all(pids.map(id => load(id, staff)));
  const reps = states.map(s => monthReport(s, month));
  const x = new Sheet('Collections ' + month).title(`Monthly collection report · ${fm(month)}`).note(`${pid && states[0] ? states[0].proj.name : 'All buildings'} · downloaded by ${staff.name} on ${fd(todayPKT())}`)
    .section('Summary').head(['Building', ['Billed (Rs)', 'money'], ['Bills', 'int'], ['Collected (Rs)', 'money'], ['Payments', 'int'], ['Collected / billed', 'pct'], ['Still owed today (Rs)', 'money'], ['Apartments owing', 'int'], ['Apartments', 'int']]);
  for (const y of reps) x.row([y.pname, y.billed, y.nBills, y.collected, y.nPays, y.billed ? y.collected / y.billed : null, y.outstanding, y.owing, y.aptCount]);
  if (reps.length > 1) { const s = (f: (y: typeof reps[number]) => number) => reps.reduce((a, y) => a + f(y), 0), b = s(y => y.billed);
    x.total(['Total', b, s(y => y.nBills), s(y => y.collected), s(y => y.nPays), b ? s(y => y.collected) / b : null, s(y => y.outstanding), s(y => y.owing), s(y => y.aptCount)]); }
  if (reps.some(y => y.elec.billed || y.elec.unpaid)) {
    x.section('Electricity').head(['Building', ['Billed this month (Rs)', 'money'], ['Bills', 'int'], ['Collected this month (Rs)', 'money'], ['Still unpaid (Rs)', 'money'], ['Customers owing', 'int']]);
    for (const y of reps) if (y.elec.billed || y.elec.unpaid) x.row([y.pname, y.elec.billed, y.elec.n, y.elec.collected, y.elec.unpaid, y.elec.owing]);
  }
  x.section('By who took the cash').head(['Building', 'Name', ['Payments', 'int'], ['Amount (Rs)', 'money']]);
  let n = 0, amt = 0;
  for (const y of reps) for (const c of y.byCollector) { x.row([y.pname, c.name, c.n, c.amount]); n += c.n; amt += c.amount; }
  x.total(['Total', '', n, amt]);
  x.section('Payments').head(['Building', ['Date', 'date'], 'Time', 'Apartment', 'Owner', ['Amount (Rs)', 'money'], 'Taken by', 'Receipt', 'Voucher / ref']);
  let pt = 0, pn = 0;
  for (const s of states) use(s, () => s.payments.filter(p => p.d.slice(0, 7) === month && !p.reversed).sort((a, b) => `${a.d}${a.t}`.localeCompare(`${b.d}${b.t}`)).forEach(p => {
    const o = ownerById(p.ownerId); x.row([s.proj.name, p.d, t12(p.t), o?.apt, o?.name, p.amount, p.collectorName || p.by, p.receipt, p.ref]); pt += p.amount; pn++;
  }));
  x.total(['Total', '', '', '', `${pn} payment${pn === 1 ? '' : 's'}`, pt]);
  return xlsxResponse(x, `minawa-collections-${month}-${pid || 'all'}`);
}
