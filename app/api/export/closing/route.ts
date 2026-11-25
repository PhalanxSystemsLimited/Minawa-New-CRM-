// Closing statement as an Excel workbook (26 Nov 2026, Statements screen): for each building chosen, every customer's
// opening balance, charges, fines, discounts and credits, payments and closing balance for the period, with totals,
// what is left of each year, and a sheet of every payment in the period (receipt, the months it paid for, cash book
// number or bank reference, who entered and approved it). Accountants and Admins, their own buildings.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { closingRows } from '@/lib/statements';
import { custId } from '@/lib/people';
import { fd, periodText, todayPKT } from '@/lib/fmt';
import { PLAN_LABEL } from '@/lib/types';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';
const okD = (x: string | null) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  if (staff.role === 'manager') return new Response('not part of your role', { status: 403 });
  const u = new URL(req.url), today = todayPKT();
  const to = okD(u.searchParams.get('to')) ? u.searchParams.get('to')! : today, f0 = okD(u.searchParams.get('from')) ? u.searchParams.get('from')! : `${to.slice(0, 7)}-01`, from = f0 > to ? to : f0;
  const mine = await liveProjects(staff), want = u.searchParams.get('project') || '';
  const projs = want ? mine.filter(p => p.id === want) : mine;
  if (!projs.length) return new Response('not found', { status: 404 });
  const states = await Promise.all(projs.map(p => load(p.id, staff)));
  const sum = new Sheet('Closing statement').title(`Closing statement · ${fd(from)} – ${fd(to)}`).note(`${projs.map(p => p.name).join(', ')} · made ${fd(today)} by ${staff.name}`)
    .head(['Building', 'Flat', 'Customer ID', 'Customer', 'Plan', 'Status', ['Opening (Rs)', 'money'], ['Charged (Rs)', 'money'], ['Fines (Rs)', 'money'], ['Discounts & credits (Rs)', 'money'], ['Paid (Rs)', 'money'], ['Closing (Rs)', 'money'], 'Left, by year']);
  const pay = new Sheet('Payments').title(`Payments · ${fd(from)} – ${fd(to)}`).note('Every payment recorded in the period, with the months it paid for.')
    .head([['Date', 'date'], 'Building', 'Flat', 'Customer', 'Receipt', ['Amount (Rs)', 'money'], 'For (months)', 'Received as', 'Cash book / reference', 'Entered by', 'Approved by', 'Status']);
  const tot = { opening: 0, charges: 0, fines: 0, credits: 0, paid: 0, closing: 0 }; let n = 0, pt = 0;
  for (const s of states) use(s, () => {
    for (const r of closingRows(from, to)) {
      n++; for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += r[k];
      sum.row([s.proj.name, r.o.apt, r.id, r.o.name, PLAN_LABEL[r.o.plan || 'monthly'], r.o.status === 'active' ? 'Active' : 'Left', r.opening, r.charges, r.fines, r.credits, r.paid, r.closing, r.years]);
    }
    for (const p of s.payments.filter(x => x.d >= from && x.d <= to).sort((a, b) => `${a.d}${a.t}`.localeCompare(`${b.d}${b.t}`))) {
      const o = ownerById(p.ownerId), pr = p.entryId ? s.proofs.find(x => x.id === p.entryId) : null; pt += p.reversed ? 0 : p.amount;
      pay.row([p.d, s.proj.name, o?.apt || '', o ? `${o.name} (${custId(o)})` : '', p.receipt, p.amount, p.periodFrom ? periodText(p.periodFrom, p.periodTo) : '', /bank/i.test(p.method) ? 'Bank transfer' : 'Cash',
        p.txn ? `TXN ${p.txn}` : p.ref || '', p.enteredBy || p.by || '', p.approvedBy || '', p.reversed ? 'Taken back' : pr?.status === 'pending' ? 'Waiting for the accountant' : 'Confirmed']);
    }
  });
  sum.total(['Total', `${n} customers`, '', '', '', '', tot.opening, tot.charges, tot.fines, tot.credits, tot.paid, tot.closing, '']);
  pay.total(['Total', '', '', '', '', pt, '', '', '', '', '', '']);
  return xlsxResponse([sum, pay], `Closing-statement-${want || 'all'}-${from}-to-${to}`);
}
