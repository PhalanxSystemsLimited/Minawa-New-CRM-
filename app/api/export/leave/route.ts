// A customer leaving (Phase 3): the final figures and payments as CSV. With ?d=: the charges up to that leaving date
// (still to pay, or cleared); for a customer who has left: the "All charges cleared" report.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, ownerById, leaveFigures, billsOf, sortedPayments, periodLabel, balance } from '@/lib/engine';
import { todayPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project') || '', oid = u.searchParams.get('oid') || '';
  if (!(await liveProjects(staff)).some(p => p.id === pid)) return new Response('not found', { status: 404 });
  const s = await load(pid, staff), row = (a: unknown[]) => a.map(cell).join(',');
  const out = use(s, () => {
    const o = ownerById(oid); if (!o) return null;
    const L = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get('d') || '') ? u.searchParams.get('d')! : (o.closedOn || s.today);
    const lines = [row([o.status === 'closed' ? 'All charges cleared' : 'Charges before leaving', s.proj.name, o.apt, o.name]), row(['Possession', o.possessionKnown ? o.possession : '', 'Leaving', L]),
      row(['Meter at possession', o.meterIn?.reading ?? '', 'Meter at leaving', o.meterOut?.reading ?? '']), ''];
    if (o.status !== 'closed') {
      const f = leaveFigures(o, L);
      lines.push(row(['Balance now (Rs)', f.balance]), row(['Maintenance up to leaving, not billed yet (Rs)', f.unbilled]), row(['Credit for days billed after leaving (Rs)', f.credit]),
        row([f.due > 0 ? 'Still to pay before leaving (Rs)' : 'Advance to refund (Rs)', Math.abs(f.due)]), row([f.due > 0 ? 'Charges are not cleared' : 'All charges cleared']), '');
    } else lines.push(row(['Balance at leaving (Rs)', balance(o)]), '');
    lines.push(row(['Bills']), row(['Bill', 'Period', 'Due date', 'Amount (Rs)', 'Paid (Rs)', 'Unpaid (Rs)']));
    for (const b of billsOf(o)) lines.push(row([b.id, periodLabel(b), b.dueDate, b.net, b.paid, b.net - b.paid]));
    lines.push('', row(['Payments']), row(['Date', 'Amount (Rs)', 'Received as', 'Receipt', 'Entered by', 'Approved by']));
    for (const p of sortedPayments().filter(p => p.ownerId === o.id).reverse()) lines.push(row([p.d, p.amount, p.method, p.receipt, p.enteredBy || p.by, p.approvedBy || '']));
    return { lines, apt: o.apt };
  });
  if (!out) return new Response('not found', { status: 404 });
  return new Response('﻿' + out.lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-${pid}-${out.apt.replace(/[^\w-]+/g, '_')}-leaving-${todayPKT()}.csv"` } });
}
