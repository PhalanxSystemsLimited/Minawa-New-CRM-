// The daily cash reconciliation as CSV (/cash): per building and person, cash in hand at the start of the day, taken,
// handed over, in hand at the end; then the hand-overs the Accountant received and the bank deposits that day.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { dayCash } from '@/lib/cash';
import { todayPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const q = new URL(req.url).searchParams.get('d') || '', d = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayPKT();
  const states = await Promise.all((await liveProjects(staff)).map(p => load(p.id, staff)));
  const r = dayCash(states, d), mine = staff.role === 'manager';
  const rows = r.rows.filter(x => !mine || x.collectorId === staff.id);
  const lines = [[`Cash reconciliation ${d}`].map(cell).join(','), '',
    ['Building', 'Who took the cash', 'In hand at start (Rs)', 'Taken (Rs)', 'Payments', 'Handed over (Rs)', 'In hand at end (Rs)'].map(cell).join(',')];
  for (const x of rows) lines.push([x.pname, x.name, x.open, x.collected, x.nCollected, x.handed, x.close].map(cell).join(','));
  const tot = (k: 'open' | 'collected' | 'handed' | 'close') => rows.reduce((a, x) => a + x[k], 0);
  lines.push(['Total', '', tot('open'), tot('collected'), rows.reduce((a, x) => a + x.nCollected, 0), tot('handed'), tot('close')].map(cell).join(','));
  if (!mine) {
    lines.push('', ['Received by the Accountant'].map(cell).join(','), ['Hand-over', 'Building', 'From', 'Received by', 'Amount (Rs)'].map(cell).join(','));
    for (const { h, pname } of r.received) lines.push([h.id, pname, h.fromName, h.receivedBy, h.amount].map(cell).join(','));
    lines.push('', ['Deposited in the bank'].map(cell).join(','), ['Hand-over', 'Building', 'Slip', 'Deposited by', 'Amount (Rs)'].map(cell).join(','));
    for (const { h, pname } of r.deposited) lines.push([h.id, pname, h.depositSlip, h.depositedBy, h.amount].map(cell).join(','));
  }
  if (r.pending.length) lines.push('', [`Not counted: ${r.pending.length} cash entries (Rs ${r.pending.reduce((a, x) => a + x.pr.amount, 0)}) still waiting for the Accountant to confirm`].map(cell).join(','));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-cash-${d}.csv"` } });
}
