// Entries to approve as CSV (Accountant's To do): payments building managers entered and nobody has approved yet.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { todayPKT, t12 } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const pid = new URL(req.url).searchParams.get('project');
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const lines = [['Building', 'Entered on', 'Time', 'Apartment', 'Customer', 'Amount (Rs)', 'Received as', 'Paid on', 'Receipt no.', 'Bank transaction ID', 'Entered by', 'Note'].map(cell).join(',')];
  let total = 0;
  for (const id of pids) {
    const s = await load(id, staff);
    use(s, () => s.proofs.filter(p => p.kind === 'cash' && p.status === 'pending' && (staff.role !== 'manager' || p.byId === staff.id)).forEach(p => {
      const o = ownerById(p.ownerId); total += p.amount;
      lines.push([s.proj.name, p.d, t12(p.t), o?.apt, o?.name, p.amount, p.method || 'Cash', p.paidOn, p.ref, p.txn, p.byName, p.note].map(cell).join(','));
    }));
  }
  lines.push(['Total', '', '', '', '', total].map(cell).join(','));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-entries-to-approve-${pid || 'all'}-${todayPKT()}.csv"` } });
}
