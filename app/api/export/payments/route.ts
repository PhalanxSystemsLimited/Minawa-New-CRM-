// Payments as CSV (one project, or all projects).
import { currentStaff } from '@/lib/session';
import { load, liveProjects } from '@/lib/ops';
import { use, ownerById } from '@/lib/engine';
import { payFiltered } from '@/lib/queries';
import { spInfo } from '@/lib/docdata';
import { todayPKT, t12 } from '@/lib/fmt';

export const dynamic = 'force-dynamic';
const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const staff = await currentStaff();
  if (!staff) return new Response('sign in first', { status: 401 });
  const u = new URL(req.url), pid = u.searchParams.get('project'), per = u.searchParams.get('per') || 'all', fam = u.searchParams.get('fam') || 'all', q = u.searchParams.get('q') || '';
  const pids = pid ? [pid] : (await liveProjects()).map(p => p.id);
  const lines = [['Project', 'Date', 'Time', 'Apartment', 'Owner', 'Amount (Rs)', 'Method', 'Received through', 'Recorded by', 'Receipt', 'Reference', 'Safepay tracker', 'Safepay link'].map(cell).join(',')];
  for (const id of pids) {
    const s = await load(id, staff);
    use(s, () => payFiltered(per, fam, q).forEach(p => { const o = ownerById(p.ownerId), sp = spInfo(p);
      lines.push([s.proj.name, p.d, t12(p.t), o.apt, o.name, p.amount, p.method, sp ? `Safepay (${sp.mode})` : 'Bank', sp ? 'Automatic' : p.by, p.receipt, p.ref, sp?.tracker || '', sp?.link || ''].map(cell).join(',')); }));
  }
  return new Response('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="minawa-payments-${pid || 'all'}-${todayPKT()}.csv"` } });
}
