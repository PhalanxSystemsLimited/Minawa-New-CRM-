// Customers as an Excel workbook (21 Nov 2026, Customers screen): the active or past customers shown (or only the
// ticked ones), one row each, and for up to 60 customers a sheet each with their details, payments, bills and every
// entry on their account. Every role, their own buildings.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, balance, billsOf, sortedPayments, periodLabel, unpaid } from '@/lib/engine';
import { custId } from '@/lib/people';
import { PLAN_LABEL, type Owner, type State } from '@/lib/types';
import { todayPKT, t12, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';
const DETAIL_MAX = 60;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), today = todayPKT(), v = u.searchParams.get('v') === 'past' ? 'past' : u.searchParams.get('v') === 'all' ? 'all' : 'active';
  const mine = await liveProjects(staff), want = (u.searchParams.get('p') || '').split(',').filter(Boolean);
  const pids = (want.length ? mine.filter(p => want.includes(p.id)) : mine).map(p => p.id);
  const sel = new Set(u.searchParams.getAll('sel')), q = (u.searchParams.get('q') || '').trim().toLowerCase(), digits = q.replace(/\D/g, '');
  const states = await Promise.all(pids.map(id => load(id, staff)));
  type R = { s: State; o: Owner; id: string };
  const rows: R[] = states.flatMap(s => use(s, () => s.owners.map(o => ({ s, o, id: custId(o) }))))
    .filter(r => sel.size ? sel.has(`${r.s.project}|${r.o.id}`) : (v === 'all' || (v === 'past') === (r.o.status === 'closed')) &&
      (!q || `${r.id} ${r.o.name} ${r.o.apt} ${r.o.phone} ${r.o.cnic || ''} ${r.s.proj.name}`.toLowerCase().includes(q) || (digits.length >= 4 && `${r.o.cnic || ''}${r.o.phone}`.replace(/\D/g, '').includes(digits))))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const what = sel.size ? 'Selected customers' : v === 'past' ? 'Past customers' : v === 'all' ? 'Customers' : 'Active customers';
  const x = new Sheet(what).title(`${what} · ${fd(today)}`).note(`${rows.length} customer${rows.length === 1 ? '' : 's'} · ${pids.length === mine.length ? 'all your buildings' : states.map(s => s.proj.name).join(', ')} · downloaded by ${staff.name}`).blank()
    .head(['Customer ID', 'Full name', 'CNIC', ['CNIC expiry', 'date'], 'Address on CNIC', 'WhatsApp', 'Building', 'Apartment', 'Type', 'Billing plan', ['Possession', 'date'], 'Status', ['Left on', 'date'], ['Charged (Rs)', 'money'], ['Paid (Rs)', 'money'], ['Balance (Rs)', 'money']]);
  const figs = (r: R) => use(r.s, () => ({ charged: r.s.entries.filter(e => e.ownerId === r.o.id && e.amount > 0).reduce((a, e) => a + e.amount, 0), paid: r.s.payments.filter(p => p.ownerId === r.o.id && !p.reversed).reduce((a, p) => a + p.amount, 0), bal: balance(r.o) }));
  let tc = 0, tp = 0, tb = 0;
  for (const r of rows) { const f = figs(r); tc += f.charged; tp += f.paid; tb += f.bal;
    x.row([r.id, r.o.name, r.o.cnic, r.o.cnicExpiry, r.o.cnicAddress, r.o.noPhone ? '' : r.o.phone, r.s.proj.name, r.o.apt, r.o.type, PLAN_LABEL[r.o.plan || 'monthly'], r.o.possessionKnown ? r.o.possession : 'not on file', r.o.status === 'active' ? 'Active' : 'Past customer', r.o.closedOn, f.charged, f.paid, f.bal]); }
  x.total(['Total', `${rows.length} customers`, '', '', '', '', '', '', '', '', '', '', '', tc, tp, tb]);
  const sheets = [x];
  // A sheet each (their whole history), when there aren't too many.
  if (rows.length <= DETAIL_MAX) for (const r of rows) sheets.push(use(r.s, () => {
    const o = r.o, y = new Sheet(r.id).title(`${r.id} · ${o.name}`).note(`${o.apt}, ${r.s.proj.name} · ${o.status === 'active' ? 'active customer' : `past customer, left ${o.closedOn ? fd(o.closedOn) : ''}`}`)
      .section('Details').head(['Item', 'Value']);
    y.row(['CNIC', o.cnic || 'not on file']).row(['CNIC expiry', o.cnicExpiry ? fd(o.cnicExpiry) : '—']).row(['Address on CNIC', o.cnicAddress || '—']).row(['WhatsApp', o.noPhone ? 'none' : o.phone])
      .row(['Possession', o.possessionKnown ? fd(o.possession) : 'not on file']).row(['Left on', o.closedOn ? fd(o.closedOn) : '—']).row(['Billing plan', PLAN_LABEL[o.plan || 'monthly']]).row(['Balance now', `Rs ${balance(o).toLocaleString('en-US')}`]);
    y.section('Payments').head([['Date', 'date'], 'Time', ['Amount (Rs)', 'money'], 'Received as', 'Receipt', 'Entered by', 'Confirmed by', 'Note']);
    const pays = sortedPayments().filter(p => p.ownerId === o.id).reverse();
    for (const p of pays) y.row([p.d, t12(p.t), p.amount, p.method, p.receipt, p.enteredBy || p.by, p.approvedBy || '', p.reversed ? `Taken back: ${p.reversed.reason}` : '']);
    y.total(['Total', '', pays.filter(p => !p.reversed).reduce((a, p) => a + p.amount, 0)]);
    y.section('Bills').head(['Bill', 'Period', ['Billed', 'date'], ['Due', 'date'], ['Amount (Rs)', 'money'], ['Paid (Rs)', 'money'], ['Unpaid (Rs)', 'money']]);
    const bills = billsOf(o);
    for (const b of bills) y.row([b.id, periodLabel(b), b.billDate, b.dueDate, b.net, b.paid + b.finePaid, Math.max(0, unpaid(b))]);
    y.total(['Total', '', '', '', bills.reduce((a, b) => a + b.net, 0), bills.reduce((a, b) => a + b.paid + b.finePaid, 0), bills.reduce((a, b) => a + Math.max(0, unpaid(b)), 0)]);
    y.section('Account history').head([['Date', 'date'], 'What happened', 'Reference', ['Amount (Rs)', 'money'], ['Balance (Rs)', 'money']]);
    let run = 0; for (const e of r.s.entries.filter(e => e.ownerId === o.id)) { run += e.amount; y.row([e.d, e.desc, e.ref, e.amount, run]); }
    return y;
  }));
  return xlsxResponse(sheets, `minawa-${sel.size ? 'selected' : v}-customers-${today}`);
}
