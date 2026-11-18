// Customers with no possession date as CSV (Possession dates page), for the buildings the person looks after.
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, apartments, aptOrder, balance } from '@/lib/engine';
import { todayPKT } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const pid = new URL(req.url).searchParams.get('project');
  const mine = (await liveProjects(staff)).map(p => p.id), pids = pid ? (mine.includes(pid) ? [pid] : []) : mine;
  const lines = [['Building', 'Apartment', 'Block', 'Type', 'Customer', 'WhatsApp', 'Owes (Rs)', 'Possession date (fill in)'].map(cell).join(',')];
  for (const id of pids) {
    const s = await load(id, staff);
    use(s, () => apartments().filter(o => o.status === 'active' && !o.possessionKnown).sort(aptOrder)
      .forEach(o => lines.push([s.proj.name, o.apt, o.block, o.type, o.name, o.noPhone ? '' : o.phone, Math.max(0, balance(o)), ''].map(cell).join(','))));
  }
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-no-possession-date-${pid || 'all'}-${todayPKT()}.csv"` } });
}
