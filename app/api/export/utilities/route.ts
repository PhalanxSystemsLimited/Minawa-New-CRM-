// The month's utility sheet as CSV (apartment, owner, units, amount), to fill in Excel and import back.
import { currentStaff } from '@/lib/session';
import { load } from '@/lib/ops';
import { use, apartments, aptOrder } from '@/lib/engine';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project') || '', period = u.searchParams.get('period') || '', kind = u.searchParams.get('kind') || 'Electricity';
  const s = await load(pid, staff);
  const lines = [['Apartment', 'Block', 'Owner', 'Units', 'Amount'].map(cell).join(',')];
  use(s, () => apartments().filter(o => o.status === 'active').sort(aptOrder).forEach(o => {
    const c = s.charges.find(x => x.ownerId === o.id && x.period === period && x.kind === kind);
    lines.push([o.apt, o.block, o.name, c?.units ?? '', c?.amount ?? ''].map(cell).join(','));
  }));
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind.toLowerCase()}-${pid}-${period}.csv"` } });
}
