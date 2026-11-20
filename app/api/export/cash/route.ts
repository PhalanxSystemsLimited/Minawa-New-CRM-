// The daily cash reconciliation as an Excel workbook (Payments, cash): per building and person, cash in hand at the
// start of the day, taken, handed over, in hand at the end; then the hand-overs the Accountant received and the bank
// deposits that day.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { dayCash } from '@/lib/cash';
import { todayPKT, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const q = new URL(req.url).searchParams.get('d') || '', d = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayPKT();
  const states = await Promise.all((await liveProjects(staff)).map(p => load(p.id, staff)));
  const r = dayCash(states, d), mine = staff.role === 'manager';
  const rows = r.rows.filter(x => !mine || x.collectorId === staff.id);
  const x = new Sheet('Cash ' + d).title(`Daily cash reconciliation · ${fd(d)}`).note(`Minawa CRM · downloaded by ${staff.name} on ${fd(todayPKT())}`).blank()
    .head(['Building', 'Who took the cash', ['In hand at start (Rs)', 'money'], ['Taken (Rs)', 'money'], ['Payments', 'int'], ['Handed over (Rs)', 'money'], ['In hand at end (Rs)', 'money']]);
  for (const y of rows) x.row([y.pname, y.name, y.open, y.collected, y.nCollected, y.handed, y.close]);
  const tot = (k: 'open' | 'collected' | 'handed' | 'close') => rows.reduce((a, y) => a + y[k], 0);
  x.total(['Total', '', tot('open'), tot('collected'), rows.reduce((a, y) => a + y.nCollected, 0), tot('handed'), tot('close')]);
  if (!mine) {
    x.section('Received by the Accountant').head(['Hand-over', 'Building', 'From', 'Received by', ['Amount (Rs)', 'money']]);
    for (const { h, pname } of r.received) x.row([h.id, pname, h.fromName, h.receivedBy, h.amount]);
    x.total(['Total', '', '', '', r.received.reduce((a, y) => a + y.h.amount, 0)]);
    x.section('Deposited in the bank').head(['Hand-over', 'Building', 'Slip', 'Deposited by', ['Amount (Rs)', 'money']]);
    for (const { h, pname } of r.deposited) x.row([h.id, pname, h.depositSlip, h.depositedBy, h.amount]);
    x.total(['Total', '', '', '', r.deposited.reduce((a, y) => a + y.h.amount, 0)]);
  }
  if (r.pending.length) x.blank().note(`Not counted: ${r.pending.length} cash entries (Rs ${r.pending.reduce((a, y) => a + y.pr.amount, 0).toLocaleString('en-US')}) still waiting for the Accountant to confirm.`);
  return xlsxResponse(x, `minawa-cash-${d}`);
}
