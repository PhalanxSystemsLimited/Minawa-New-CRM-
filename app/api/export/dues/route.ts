// The dues / defaulters list as an Excel workbook (Reports): every apartment that owes money now, worst first.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { duesList } from '@/lib/reports';
import { todayPKT, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';
const ST: Record<string, string> = { due: 'Due', overdue: 'Overdue', flagged: 'Maintenance discontinued' };

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project'), overdue = u.searchParams.get('overdue') === '1';
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const rows = duesList(await Promise.all(pids.map(id => load(id, staff))), overdue);
  const x = new Sheet(overdue ? 'Defaulters' : 'Dues').title(`${overdue ? 'Defaulters (past the due date)' : 'Dues'} · ${fd(todayPKT())}`).note(`${rows.length} apartment${rows.length === 1 ? '' : 's'} owing · worst first · downloaded by ${staff.name}`).blank()
    .head(['Building', 'Apartment', 'Block', 'Owner', 'WhatsApp', ['Earlier dues (Rs)', 'money'], ['Unpaid bills (Rs)', 'money'], ['Unpaid bills', 'int'], ['Fine (Rs)', 'money'], ['Other charges (Rs)', 'money'], ['Total owed (Rs)', 'money'], ['Oldest due date', 'date'], ['Days overdue', 'int'], 'Status', ['Promised to pay by', 'date']]);
  for (const y of rows) x.row([y.pname, y.apt, y.block, y.name, y.phone, y.arrears, y.bills, y.nBills, y.fine, y.other, y.total, y.oldestDue, y.daysOver, ST[y.status] || y.status, y.promise]);
  x.total(['Total', '', '', `${rows.length} apartments`, '', rows.reduce((a, y) => a + y.arrears, 0), rows.reduce((a, y) => a + y.bills, 0), rows.reduce((a, y) => a + y.nBills, 0), rows.reduce((a, y) => a + y.fine, 0), rows.reduce((a, y) => a + y.other, 0), rows.reduce((a, y) => a + y.total, 0)]);
  return xlsxResponse(x, `minawa-${overdue ? 'defaulters' : 'dues'}-${pid || 'all'}-${todayPKT()}`);
}
