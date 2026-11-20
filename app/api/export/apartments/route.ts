// Apartments as an Excel workbook (21 Nov 2026, Apartments screen): the apartments shown (or only the ticked ones)
// with their status and current customer, and every customer each has had. Apartments carry no dues.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use } from '@/lib/engine';
import { flatList, isFree, custId, FLAT_STATUS, type FlatRow } from '@/lib/people';
import { PLAN_LABEL } from '@/lib/types';
import { todayPKT, fd } from '@/lib/fmt';
import { Sheet, xlsxResponse } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), today = todayPKT(), st = u.searchParams.get('st') || '', q = (u.searchParams.get('q') || '').trim().toUpperCase();
  const mine = await liveProjects(staff), want = (u.searchParams.get('p') || '').split(',').filter(Boolean);
  const states = await Promise.all((want.length ? mine.filter(p => want.includes(p.id)) : mine).map(p => load(p.id, staff)));
  const sel = new Set(u.searchParams.getAll('sel'));
  const rows = states.flatMap(s => use(s, () => flatList().map(f => ({ s, f, cid: f.owner ? custId(f.owner) : '', ids: f.customers.map(o => ({ o, id: custId(o) })) }))))
    .filter(r => sel.size ? sel.has(`${r.s.project}|${r.f.apt}`) : (!st || (st === 'free' ? isFree(r.f) : !isFree(r.f))) && (!q || `${r.f.apt} ${r.f.block} ${r.f.floor} ${r.f.type} ${r.s.proj.name} ${r.f.owner?.name || ''} ${r.cid}`.toUpperCase().includes(q)));
  const status = (f: FlatRow) => f.status === 'booked' ? 'Booked (waiting for approval)' : FLAT_STATUS[f.status];
  const x = new Sheet('Apartments').title(`${sel.size ? 'Selected apartments' : st === 'free' ? 'Available apartments' : st === 'taken' ? 'Possessed or booked apartments' : 'Apartments'} · ${fd(today)}`)
    .note(`${rows.length} apartment${rows.length === 1 ? '' : 's'} · ${rows.filter(r => isFree(r.f)).length} available · downloaded by ${staff.name}`).blank()
    .head(['Building', 'Apartment', 'Block', 'Floor', 'Type', 'Billing plan', 'Status', 'Customer ID', 'Current customer', ['Possession', 'date'], ['Customers so far', 'int'], 'Last customer left', ['Left on', 'date']]);
  for (const r of rows) { const f = r.f, o = f.owner;
    x.row([r.s.proj.name, f.apt, f.block, f.floor, f.type, o ? PLAN_LABEL[o.plan || 'monthly'] : f.plan ? PLAN_LABEL[f.plan] : '', status(f), r.cid, o?.name || (f.waiting ? `${String(f.waiting.change?.name || '')} (waiting)` : ''), o?.possessionKnown ? o.possession : '', f.customers.length, f.lastName || '', f.leftOn]); }
  const y = new Sheet('Customers by apartment').title('Every customer of these apartments').note('Newest first in each apartment; each customer\'s dues and payments are their own.').blank()
    .head(['Building', 'Apartment', 'Customer ID', 'Customer', 'CNIC', ['Possession', 'date'], ['Left on', 'date'], 'Status']);
  for (const r of rows) for (const { o, id } of r.ids) y.row([r.s.proj.name, r.f.apt, id, o.name, o.cnic, o.possessionKnown ? o.possession : '', o.closedOn, o.status === 'active' ? 'Active customer' : 'Past customer']);
  return xlsxResponse([x, y], `minawa-apartments-${sel.size ? 'selected' : st || 'all'}-${today}`);
}
