// A customer leaving (Phase 3): the final figures and payments as an Excel workbook. With ?d=: the charges up to that
// leaving date (still to pay, or cleared); for a customer who has left: the "All charges cleared" report.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, ownerById, leaveFigures, billsOf, sortedPayments, periodLabel, balance } from '@/lib/engine';
import { todayPKT, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project') || '', oid = u.searchParams.get('oid') || '';
  if (!(await liveProjects(staff)).some(p => p.id === pid)) return new Response('not found', { status: 404 });
  const s = await load(pid, staff);
  const out = use(s, () => {
    const o = ownerById(oid); if (!o) return null;
    const L = /^\d{4}-\d{2}-\d{2}$/.test(u.searchParams.get('d') || '') ? u.searchParams.get('d')! : (o.closedOn || s.today);
    const x = new Sheet(o.apt).title(`${o.status === 'closed' ? 'All charges cleared' : 'Charges before leaving'} · ${o.apt}`).note(`${o.name} · ${s.proj.name} · downloaded by ${staff.name} on ${fd(todayPKT())}`)
      .section('Details').head(['Item', ['Value', 'text']]);
    x.row(['Possession', o.possessionKnown ? fd(o.possession) : '—']).row(['Leaving', fd(L)]).row(['Meter at possession', o.meterIn?.reading ?? '—']).row(['Meter at leaving', o.meterOut?.reading ?? '—']);
    x.section('Figures').head(['Item', ['Rs', 'money']]);
    if (o.status !== 'closed') {
      const f = leaveFigures(o, L);
      x.row(['Balance now', f.balance]).row(['Maintenance up to leaving, not billed yet', f.unbilled]).row(['Credit for days billed after leaving', f.credit]);
      x.total([f.due > 0 ? 'Still to pay before leaving' : 'Advance to refund', Math.abs(f.due)]);
      x.note(f.due > 0 ? 'Charges are not cleared.' : 'All charges cleared.');
    } else x.total(['Balance at leaving', balance(o)]);
    x.section('Bills').head(['Bill', 'Period', ['Due date', 'date'], ['Amount (Rs)', 'money'], ['Paid (Rs)', 'money'], ['Unpaid (Rs)', 'money']]);
    const bills = billsOf(o);
    for (const b of bills) x.row([b.id, periodLabel(b), b.dueDate, b.net, b.paid, b.net - b.paid]);
    x.total(['Total', '', '', bills.reduce((a, b) => a + b.net, 0), bills.reduce((a, b) => a + b.paid, 0), bills.reduce((a, b) => a + b.net - b.paid, 0)]);
    x.section('Payments').head([['Date', 'date'], ['Amount (Rs)', 'money'], 'Received as', 'Receipt', 'Entered by', 'Approved by']);
    const pays = sortedPayments().filter(p => p.ownerId === o.id).reverse();
    for (const p of pays) x.row([p.d, p.amount, p.method, p.receipt, p.enteredBy || p.by, p.approvedBy || '']);
    x.total(['Total', pays.reduce((a, p) => a + p.amount, 0)]);
    return { x, apt: o.apt };
  });
  if (!out) return new Response('not found', { status: 404 });
  return xlsxResponse(out.x, `minawa-${pid}-${out.apt}-leaving-${todayPKT()}`);
}
