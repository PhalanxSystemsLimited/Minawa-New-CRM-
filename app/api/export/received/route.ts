// Payments as an Excel workbook (Payments screen, every role, their own buildings): confirmed and not-confirmed
// payments with who entered and who confirmed them. Same filters as the Payments screen.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { receivedRows } from '@/lib/received';
import { todayPKT, t12, fm, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project') || u.searchParams.get('p'), q = u.searchParams.get('month') || '';
  const month = q === 'all' ? '' : /^\d{4}-\d{2}$/.test(q) ? q : todayPKT().slice(0, 7);
  const st = u.searchParams.get('status'), status = st === 'waiting' || st === 'confirmed' ? st : '', via = u.searchParams.get('via') || '';
  const all = await liveProjects(staff), mine = all.map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const rows = receivedRows(await Promise.all(pids.map(id => load(id, staff))), { month, via, who: u.searchParams.get('who') || '', status, mine: u.searchParams.get('mine') === '1' ? staff.id : null });
  const sum = (l: typeof rows) => l.reduce((a, r) => a + r.p.amount, 0), cash = rows.filter(r => r.via === 'Cash');
  const x = new Sheet('Payments').title(`Payments · ${month ? fm(month) : 'all time'}${via ? ` · ${via}` : ''}`)
    .note(`${pid ? all.find(p => p.id === pid)?.name || pid : 'All buildings'} · cash Rs ${sum(cash).toLocaleString('en-US')} · bank Rs ${(sum(rows) - sum(cash)).toLocaleString('en-US')} · downloaded by ${staff.name} on ${fd(todayPKT())}`).blank()
    .head(['Building', ['Date', 'date'], 'Time', 'Apartment', 'Customer', ['Amount (Rs)', 'money'], 'Received as', 'Bank transaction ID', 'Entered by', 'Status', 'Confirmed by', ['Confirmed at', 'datetime'], 'Receipt', 'Receipt / voucher no.']);
  for (const r of rows) x.row([r.pname, r.p.d, t12(r.p.t), r.apt, r.owner, r.p.amount, r.via, r.p.txn, r.enteredBy, r.waiting ? 'Not confirmed yet' : 'Confirmed', r.approvedBy, r.waiting ? '' : r.p.approvedAt, r.p.receipt, r.p.ref]);
  x.total(['Total', '', '', '', `${rows.length} payment${rows.length === 1 ? '' : 's'}`, sum(rows)]);
  return xlsxResponse(x, `minawa-payments-${month || 'all'}-${pid || 'all'}`);
}
