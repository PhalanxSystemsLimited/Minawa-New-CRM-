// The monthly collection report as CSV (Reports): per building, billed vs collected, who took the cash, and each
// payment of the month.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { monthReport } from '@/lib/reports';
import { use, ownerById } from '@/lib/engine';
import { todayPKT, t12 } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project'), q = u.searchParams.get('month') || '', month = /^\d{4}-\d{2}$/.test(q) ? q : todayPKT().slice(0, 7);
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const states = await Promise.all(pids.map(id => load(id, staff)));
  const reps = states.map(s => monthReport(s, month)), row = (a: unknown[]) => a.map(cell).join(',');
  const lines = [row([`Monthly collection report ${month}`]), '', row(['Building', 'Billed (Rs)', 'Bills', 'Collected (Rs)', 'Payments', 'Collected / billed', 'Still owed today (Rs)', 'Apartments owing', 'Apartments'])];
  for (const x of reps) lines.push(row([x.pname, x.billed, x.nBills, x.collected, x.nPays, x.billed ? `${Math.round(x.collected / x.billed * 100)}%` : '', x.outstanding, x.owing, x.aptCount]));
  lines.push('', row(['By who took the cash']), row(['Building', 'Name', 'Payments', 'Amount (Rs)']));
  for (const x of reps) for (const c of x.byCollector) lines.push(row([x.pname, c.name, c.n, c.amount]));
  lines.push('', row(['Payments']), row(['Building', 'Date', 'Time', 'Apartment', 'Owner', 'Amount (Rs)', 'Taken by', 'Receipt', 'Voucher / ref']));
  for (const s of states) use(s, () => s.payments.filter(p => p.d.slice(0, 7) === month).sort((a, b) => `${a.d}${a.t}`.localeCompare(`${b.d}${b.t}`)).forEach(p => {
    const o = ownerById(p.ownerId); lines.push(row([s.proj.name, p.d, t12(p.t), o?.apt, o?.name, p.amount, p.collectorName || p.by, p.receipt, p.ref]));
  }));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-collections-${month}-${pid || 'all'}.csv"` } });
}
