// The dues / defaulters list as CSV (Reports): every apartment that owes money now, worst first.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { duesList } from '@/lib/reports';
import { todayPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const ST: Record<string, string> = { due: 'Due', overdue: 'Overdue', flagged: 'Maintenance discontinued' };

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project'), overdue = u.searchParams.get('overdue') === '1';
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const rows = duesList(await Promise.all(pids.map(id => load(id, staff))), overdue);
  const lines = [['Building', 'Apartment', 'Block', 'Owner', 'WhatsApp', 'Earlier dues (Rs)', 'Unpaid bills (Rs)', 'Unpaid bills', 'Fine (Rs)', 'Other charges (Rs)', 'Total owed (Rs)', 'Oldest due date', 'Days overdue', 'Status', 'Promised to pay by'].map(cell).join(',')];
  for (const x of rows) lines.push([x.pname, x.apt, x.block, x.name, x.phone, x.arrears, x.bills, x.nBills, x.fine, x.other, x.total, x.oldestDue, x.daysOver, ST[x.status] || x.status, x.promise].map(cell).join(','));
  lines.push(['Total', '', '', `${rows.length} apartments`, '', rows.reduce((a, x) => a + x.arrears, 0), rows.reduce((a, x) => a + x.bills, 0), '', rows.reduce((a, x) => a + x.fine, 0), rows.reduce((a, x) => a + x.other, 0), rows.reduce((a, x) => a + x.total, 0)].map(cell).join(','));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-${overdue ? 'defaulters' : 'dues'}-${pid || 'all'}-${todayPKT()}.csv"` } });
}
