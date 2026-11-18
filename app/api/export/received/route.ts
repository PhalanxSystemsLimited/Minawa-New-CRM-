// Received payments as CSV (Admin and Accountants): approved payments with who entered and who approved them.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { receivedRows } from '@/lib/received';
import { todayPKT, t12 } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff || staff.role === 'manager') return new Response('not allowed', { status: 403 });
  const u = new URL(req.url), pid = u.searchParams.get('project'), q = u.searchParams.get('month') || '', month = /^\d{4}-\d{2}$/.test(q) ? q : todayPKT().slice(0, 7);
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const rows = receivedRows(await Promise.all(pids.map(id => load(id, staff))), { month, via: u.searchParams.get('via') || '', who: u.searchParams.get('who') || '' });
  const lines = [['Building', 'Date', 'Time', 'Apartment', 'Customer', 'Amount (Rs)', 'Received as', 'Bank transaction ID', 'Entered by', 'Approved by', 'Approved at', 'Receipt', 'Receipt / voucher no.'].map(cell).join(',')];
  for (const r of rows) lines.push([r.pname, r.p.d, t12(r.p.t), r.apt, r.owner, r.p.amount, r.via, r.p.txn, r.enteredBy, r.approvedBy, r.p.approvedAt, r.p.receipt, r.p.ref].map(cell).join(','));
  lines.push(['Total', '', '', '', `${rows.length} payments`, rows.reduce((a, r) => a + r.p.amount, 0)].map(cell).join(','));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-received-${month}-${pid || 'all'}.csv"` } });
}
