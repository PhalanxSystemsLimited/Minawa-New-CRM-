// Payments as CSV (21 Nov 2026, every role, their own buildings): confirmed and not-confirmed payments with who
// entered and who confirmed them. Same filters as the Payments screen.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { receivedRows } from '@/lib/received';
import { todayPKT, t12 } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project') || u.searchParams.get('p'), q = u.searchParams.get('month') || '';
  const month = q === 'all' ? '' : /^\d{4}-\d{2}$/.test(q) ? q : todayPKT().slice(0, 7);
  const st = u.searchParams.get('status'), status = st === 'waiting' || st === 'confirmed' ? st : '';
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const rows = receivedRows(await Promise.all(pids.map(id => load(id, staff))), { month, via: u.searchParams.get('via') || '', who: u.searchParams.get('who') || '', status, mine: u.searchParams.get('mine') === '1' ? staff.id : null });
  const lines = [['Building', 'Date', 'Time', 'Apartment', 'Customer', 'Amount (Rs)', 'Received as', 'Bank transaction ID', 'Entered by', 'Status', 'Confirmed by', 'Confirmed at', 'Receipt', 'Receipt / voucher no.'].map(cell).join(',')];
  for (const r of rows) lines.push([r.pname, r.p.d, t12(r.p.t), r.apt, r.owner, r.p.amount, r.via, r.p.txn, r.enteredBy, r.waiting ? 'Not confirmed yet' : 'Confirmed', r.approvedBy, r.waiting ? '' : r.p.approvedAt, r.p.receipt, r.p.ref].map(cell).join(','));
  lines.push(['Total', '', '', '', `${rows.length} payments`, rows.reduce((a, r) => a + r.p.amount, 0)].map(cell).join(','));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-payments-${month || 'all'}-${pid || 'all'}.csv"` } });
}
